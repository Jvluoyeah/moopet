#!/usr/bin/env python3
"""狗侧 · 答题节点（W3 · 李文扬：集成 quiz_node 并挂到决策引擎入口）。

职责（对齐排期 W3「集成 quiz_node 并挂到决策引擎入口」）：
  - 出题：订阅 /dog/state 取当前等级 → QuizBank 按等级解锁科目出题
        发布 /dog/quiz/question (QuizMsg)
  - 判题：订阅 /dog/quiz/answer (QuizAnswerMsg) → ExpEngine.quiz_answer 结算加点
  - 连击：连续答对，5/10 连触发连击奖励（免周上限）
  - 难度：1~5 档，连错 3 题降一档
  - 桥接：提供 /dog/combo 服务（牛浩然 web 判题 API 对接）
  - 入口：每次作答发布 /dog/decision/event (DecisionEventMsg)，挂到决策引擎入口
  - 联动：结算后同步发布 /dog/state，让状态卡 / 决策引擎黑箱实时刷新

用法：
  ros2 run moopet_dog quiz_node
  ros2 run moopet_dog quiz_node --demo --demo-delay 6.0
  ros2 run moopet_dog quiz_node --ros-args -p db_path:=/path/to/moopet.db
"""
import json
import os

import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import (DecisionEventMsg, DogStateMsg, QuizAnswerMsg,
                                   QuizMsg)
from moopet_interfaces.srv import DogCombo
from moopet_core.exp_engine import ExpEngine
from moopet_core.quiz_bank import QuizBank, DIFFICULTY_MIN, WRONG_DROP_THRESHOLD

DEFAULT_DB = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')
INIT_DIFFICULTY = 3          # 初始难度（演示从中间档开始，便于展示降档）
DEMO_CORRECT = [True] * 10 + [False] * 3 + [True] * 2   # 10连击 → 连错3(降档) → 收尾


class QuizNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('dog_quiz')
        self.declare_parameter('db_path', DEFAULT_DB)
        db_path = self.get_parameter('db_path').get_parameter_value().string_value
        self.engine = ExpEngine(db_path)
        self.bank = QuizBank()

        self.pub_question = self.create_publisher(QuizMsg, '/dog/quiz/question', 10)
        self.pub_decision = self.create_publisher(DecisionEventMsg,
                                                  '/dog/decision/event', 10)
        self.pub_state = self.create_publisher(DogStateMsg, '/dog/state', 10)

        self.create_subscription(DogStateMsg, '/dog/state', self.on_state, 10)
        self.create_subscription(QuizAnswerMsg, '/dog/quiz/answer', self.on_answer, 10)
        self.srv = self.create_service(DogCombo, '/dog/combo', self.on_combo)

        # 答题状态
        self.level = self.engine.get_state()['level']
        self.emotion = self.engine.get_state()['emotion']
        self.combo = 0
        self.wrong_streak = 0
        self.difficulty = INIT_DIFFICULTY

        # demo 状态
        self._demo = demo
        self._demo_started = False
        self._demo_idx = 0
        self._current = None
        self._expect_correct = True
        self._used = set()

        if demo:
            self.create_timer(max(1.0, demo_delay), self._try_start_demo)

    # ---------------- 状态同步 ----------------

    def on_state(self, msg: DogStateMsg):
        self.level = msg.level
        self.emotion = msg.emotion

    # ---------------- 出题 ----------------

    def ask(self, difficulty=None):
        """按当前等级解锁出题，发布 /dog/quiz/question。返回题目或 None。"""
        q = self.bank.pick(self.level, difficulty=difficulty or self.difficulty,
                           exclude_ids=self._used)
        if q is None:
            self.get_logger().info(
                f'[quiz] 暂无可出题科目（LV.{self.level}，需 ≥3 解锁语文/数学），等待升级…')
            return None
        self._used.add(q['id'])
        self._current = q
        msg = QuizMsg()
        msg.question_id = q['id']
        msg.category = q['category']
        msg.difficulty = q['difficulty']
        msg.question = q['question']
        msg.options = q['options']
        msg.correct_answer = q['answer']
        msg.stamp = self.get_clock().now().to_msg()
        self.pub_question.publish(msg)
        self.get_logger().info(
            f'[quiz→question] [{q["category"]}] d={q["difficulty"]} {q["question"]}')
        return q

    # ---------------- 判题 + 结算 ----------------

    def on_answer(self, msg: QuizAnswerMsg):
        q = self.bank.questions.get(msg.question_id)
        if q is None:
            self.get_logger().warn(f'[quiz] 未知题目 id={msg.question_id}，忽略')
            return
        correct = self.bank.judge(q, msg.answer)
        # 连击 / 连错 / 难度
        if correct:
            self.combo += 1
            self.wrong_streak = 0
        else:
            self.combo = 0
            self.wrong_streak += 1
        difficulty_dropped = False
        if (not correct and self.wrong_streak >= WRONG_DROP_THRESHOLD
                and self.difficulty > DIFFICULTY_MIN):
            self.difficulty -= 1
            difficulty_dropped = True

        result = self.engine.quiz_answer(
            correct, combo_count=self.combo, category=q['category'],
            question_id=q['id'])
        self._settle(result, q, difficulty_dropped)
        # 挂到决策引擎入口
        self._emit_decision(q, correct, difficulty_dropped)

    # ---------------- /dog/combo 服务（判题桥接） ----------------

    def on_combo(self, request, response):
        """web 判题桥接：外部报告一次正确作答（含连击数），ROS 侧结算。"""
        self.combo = max(self.combo, request.combo_count)
        self.wrong_streak = 0
        result = self.engine.quiz_answer(
            True, combo_count=request.combo_count, category=request.category,
            question_id=0)
        self._settle(result, None, False)
        self._emit_decision(None, True, False, combo=request.combo_count,
                            category=request.category)
        response.success = True
        response.exp_gained = result['exp_gained']
        response.new_combo = request.combo_count
        response.message = result['message']
        return response

    # ---------------- 决策引擎入口 ----------------

    def _emit_decision(self, q, correct, difficulty_dropped, combo=None,
                       category=None):
        msg = DecisionEventMsg()
        msg.event_type = 'quiz_answer'
        msg.event_value = 'answer_correct' if correct else 'answer_wrong'
        params = {
            'category': category or (q['category'] if q else ''),
            'combo': combo if combo is not None else self.combo,
            'difficulty': self.difficulty,
            'difficulty_dropped': difficulty_dropped,
        }
        msg.params = json.dumps(params, ensure_ascii=False)
        msg.stamp = self.get_clock().now().to_msg()
        self.pub_decision.publish(msg)
        self.get_logger().info(
            f'[quiz→decision] {msg.event_value} params={msg.params}')

    # ---------------- 结算落地 ----------------

    def _settle(self, result, q, difficulty_dropped):
        tag = '答对' if result['correct'] else '答错'
        if result['exp_gained'] > 0:
            line = (f'[结算] {tag} +{result["exp_gained"]} 经验 '
                    f'(基础{result.get("base_exp", 0)}')
            if result.get('bonus_exp'):
                line += f' +连击{result["bonus_exp"]}'
            line += f') | LV.{result["level"]} 本周{result["week_exp"]}/2000'
            if result['leveled_up']:
                line += ' ⬆ 升级！'
            self.get_logger().info(line)
        else:
            self.get_logger().info(f'[结算] {tag}，不加点（本周已满或答错）')
        if difficulty_dropped:
            self.get_logger().info(f'[难度] 连错{WRONG_DROP_THRESHOLD}题，难度降到 {self.difficulty}')
        for name in result.get('unlocked', []):
            self.get_logger().info(f'[成就解锁] {name}')
        if result['exp_gained'] > 0 or result.get('unlocked'):
            self._publish_state(result['message'])

    def _publish_state(self, message=''):
        st = self.engine.get_state()
        msg = DogStateMsg()
        msg.level = st['level']
        msg.total_exp = st['total_exp']
        msg.week_exp = st['week_exp']
        msg.streak_days = st['streak_days']
        msg.emotion = st['emotion']
        msg.last_action = message
        msg.message = message
        msg.stamp = self.get_clock().now().to_msg()
        self.pub_state.publish(msg)

    # ---------------- demo 自动问答 ----------------

    def _try_start_demo(self):
        if self._demo_started:
            return
        if self.level < 3:                       # 语文/数学 3 级解锁
            self.get_logger().info(
                f'[quiz] demo 等待等级解锁题库（当前 LV.{self.level}，≥3 开始），3s 后重试…')
            self.create_timer(3.0, self._try_start_demo)
            return
        self._demo_started = True
        self.get_logger().info(
            f'[quiz] demo 开始：{len(DEMO_CORRECT)} 轮问答'
            f'（10 连击 → 连错3降档 → 收尾）')
        self._ask_next()

    def _ask_next(self):
        if self._demo_idx >= len(DEMO_CORRECT):
            self.get_logger().info('[quiz] demo 问答结束，进入待命')
            return
        if not self._demo_started:
            return
        q = self.ask()
        if q is None:
            self.create_timer(3.0, self._ask_next)     # 等升级后再试
            return
        self._expect_correct = DEMO_CORRECT[self._demo_idx]
        self._demo_idx += 1
        self.create_timer(1.2, self._answer_current)   # 模拟用户作答

    def _answer_current(self):
        q = self._current
        if q is None:
            return
        ans = q['answer'] if self._expect_correct else next(
            o for o in q['options'] if not self.bank.judge(q, o))
        msg = QuizAnswerMsg()
        msg.question_id = q['id']
        msg.answer = ans
        msg.is_correct = self._expect_correct
        msg.combo_count = 0
        msg.stamp = self.get_clock().now().to_msg()
        self.get_logger().info(
            f"[quiz←answer] {'答对' if msg.is_correct else '答错'}：{ans}")
        self.on_answer(msg)
        self.create_timer(1.0, self._ask_next)


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--demo-delay', type=float, default=0.0)
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = QuizNode(demo=args.demo, demo_delay=args.demo_delay)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.engine.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
