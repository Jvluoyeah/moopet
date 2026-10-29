#!/usr/bin/env python3
"""行为树 · 行为节点（W4 完稿 · 李文扬）。

W3 可用的行为（支撑答题 + 基础事件闭环的「反应」）：
  - QuizReactionAction    答对摇尾巴表扬 / 答错鼓励（含难度降档提示）
  - Pet / Handshake / Call / AirQuality / Walk / Guide 反应
W4 真实化的行为（对齐狗2.md 情感连接层）：
  - AnniversaryReactionAction     早安/晚安/里程碑/自定义纪念日（按性格说不同的话）
  - ProactiveCareReactionAction   长沉默主动搭话（按情感账户档位选语气）+ 深夜关怀
  - PersonalityDeciderAction      性格变化播报（"我好像变得更粘人啦"）
每个反应 dict 供决策引擎落地：tts_text（语音）/ action_type（/dog/action 动作）。
"""
from .core import Action


def _personality_line(p):
    """按性格给一句自我描述（用于性格变化播报）。"""
    return {
        '粘人型': '更黏主人啦',
        '话痨型': '变得更爱说话啦',
        '安静型': '变得更安静啦，但我会一直陪着你',
        '独立型': '更独立啦，主人忙的时候我会自己玩',
    }.get(p, f'变成{p}啦')


def _greet(kind, personality):
    """仪式/纪念日问候按性格说不同的话（对齐狗2.md 独特性格塑造）。"""
    if kind == 'morning':
        return {
            '粘人型': '主人早上好呀！我在这儿等你好久啦，今天也要一直陪我哦！',
            '话痨型': '早安早安！今天我们干点什么呢？我都想好十件事啦！',
            '安静型': '早上好，主人。今天也一起加油。',
            '独立型': '早啊主人，我去晒会儿太阳。',
        }.get(personality, '早上好主人！新的一天开始啦，汪！')
    if kind == 'evening':
        return {
            '粘人型': '晚安主人～今晚也要梦到我哦，我会守在你身边的！',
            '话痨型': '晚安啦！明天见明天见！对了明天我们…好啦好啦不说了，晚安！',
            '安静型': '晚安，主人。好梦。',
            '独立型': '晚安主人，我先睡啦。',
        }.get(personality, '晚安主人，做个好梦，明天见！')
    return ''


class QuizReactionAction(Action):
    """答题反应（W3 可运行）：答对→表扬+摇尾巴，答错→鼓励。"""

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        correct = ctx.get('event_value') == 'answer_correct'
        category = params.get('category', '')
        combo = int(params.get('combo', 0) or 0)
        difficulty = params.get('difficulty', '')
        if correct:
            text = f'答对啦（{category}）！我摇摇尾巴给你庆祝～'
            if combo in (5, 10):
                text += f' 连击×{combo}！加餐奖励！'
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text=text, emotion_after='happy',
                        params=dict(combo=combo, category=category))
        text = f'没关系（{category}），我们再来一次～'
        if params.get('difficulty_dropped'):
            text = f'唔，这道有点难（{category}），我陪你把难度降到 {difficulty} 慢慢来～'
        return dict(behavior=self.name, tone='encourage', action_type=None,
                    tts_text=text, emotion_after='neutral',
                    params=dict(combo=combo, category=category))


class PetReactionAction(Action):
    """抚摸反应（W3 基础版）：被摸摸头好舒服。"""

    def run(self, ctx):
        zone = (ctx.get('params', {}) or {}).get('zone', '')
        return dict(behavior=self.name, tone='cheer', action_type=None,
                    tts_text='被摸摸头好舒服～再摸一下嘛！',
                    emotion_after='happy', params=dict(zone=zone))


class HandshakeReactionAction(Action):
    """握手反应（W3 基础版）：回握动作联动（/dog/action handshake）。"""

    def run(self, ctx):
        return dict(behavior=self.name, tone='cheer', action_type='handshake',
                    tts_text='握握手，好朋友！', emotion_after='happy', params={})


class CallReactionAction(Action):
    """呼唤反应（W3 基础版）：听到主人呼唤回应。"""

    def run(self, ctx):
        return dict(behavior=self.name, tone='cheer', action_type=None,
                    tts_text='在的在的！主人叫我啦，汪！', emotion_after='happy', params={})


class AirQualityReactionAction(Action):
    """空气质量反应（W3 基础版）：变差提醒通风 / 通风完成表扬。"""

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        if params.get('ventilated'):
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text='通风啦，空气变清新了，谢谢主人！',
                        emotion_after='happy', params={})
        return dict(behavior=self.name, tone='neutral', action_type=None,
                    tts_text='室内空气有点差，提醒主人开窗通风哦～',
                    emotion_after='tired', params={})


class WalkReactionAction(Action):
    """散步反应（W3 基础版）。"""

    def run(self, ctx):
        return dict(behavior=self.name, tone='cheer', action_type=None,
                    tts_text='出去散步最开心啦！跑起来！', emotion_after='happy', params={})


class GuideReactionAction(Action):
    """使用指引完成反应（W3 基础版）。"""

    def run(self, ctx):
        return dict(behavior=self.name, tone='cheer', action_type=None,
                    tts_text='使用指引完成！现在我是会成长的大狗狗啦！',
                    emotion_after='happy', params={})


# ---------------- W4 真实化（情感连接层） ----------------

class AnniversaryReactionAction(Action):
    """纪念日/仪式反应（W4）：早安/晚安/等级里程碑/自定义纪念日。

    对齐狗2.md：早安/晚安仪式、纪念日提醒、等级里程碑庆祝。
    反应带 mark_ritual（morning/evening）供引擎记录"今日已问候"。
    """

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        bb = ctx.get('blackboard') or {}
        personality = params.get('personality') or bb.get('personality', '')
        # 优先级：自定义纪念日 > 等级里程碑 > 早安/晚安
        anniv_name = params.get('anniversary_name')
        if anniv_name:
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text=f'今天是「{anniv_name}」！汪汪！一起纪念这个日子吧！',
                        emotion_after='happy', params=dict(kind='anniversary',
                                                           name=anniv_name),
                        mark_ritual='anniversary')
        milestone = params.get('milestone')
        if milestone:
            level = int(milestone)
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text=(f'我升到 LV.{level} 啦！谢谢主人一直陪我，'
                                  f'撒花庆祝！'),
                        emotion_after='happy', params=dict(kind='milestone',
                                                           level=level))
        ritual = params.get('ritual')
        if ritual in ('morning', 'evening'):
            text = _greet(ritual, personality)
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text=text, emotion_after='happy',
                        params=dict(kind=ritual), mark_ritual=ritual)
        return dict(behavior=self.name, tone='neutral', action_type=None,
                    tts_text='', params={})


class ProactiveCareReactionAction(Action):
    """主动关怀反应（W4）：长沉默时按情感账户档位主动搭话。

    对齐狗2.md：主动关怀（长时间沉默主动搭话）、
    情感账户（投入越多回应越丰富；长期忽视会伤心）。
    冷淡期不触发（由 EmotionAccountGE 条件挡住）。
    """

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        level = params.get('account_level') or 'balanced'
        hour = params.get('hour', 12)
        is_night = hour >= 23 or hour < 6
        if is_night:
            return dict(behavior=self.name, tone='gentle', action_type=None,
                        tts_text='夜深了，主人早点休息哦，我守着你。',
                        emotion_after='tired', params=dict(care='night'))
        if level == 'warm':
            text = '主人你去哪啦，我等你好久啦！要不要陪我玩会儿？'
        elif level == 'balanced':
            text = '主人好久没理我了…有点想你，要不要摸摸我？'
        else:
            text = '…你回来啦。'
        return dict(behavior=self.name, tone='cheer' if level == 'warm' else 'gentle',
                    action_type=None, tts_text=text,
                    emotion_after='happy' if level == 'warm' else 'neutral',
                    params=dict(care='idle', account_level=level))


class PersonalityDeciderAction(Action):
    """性格播报（W4）：性格由计数器演化变化时主动告知（仅 tick 检查时播报）。"""

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        bb = ctx.get('blackboard') or {}
        p = params.get('personality') or bb.get('personality', '')
        if params.get('personality_changed'):
            bb['_personality_changed'] = False    # 播报后消费标记，避免重复
            return dict(behavior=self.name, tone='cheer', action_type=None,
                        tts_text=f'好像…我{_personality_line(p)}，请多指教！',
                        emotion_after='happy', params=dict(personality=p))
        return dict(behavior=self.name, tone='neutral', action_type=None,
                    tts_text='', params=dict(personality=p))


# ---------------- W5 火花集成（行为/回复联动） ----------------

class SparkReminderReactionAction(Action):
    """火花三档提醒（W5）：18:00 / 21:00 / 23:00 按档位说不同的话，催主人续火。

    对齐排期 W5「火花全流程与行为/回复联动（提醒三档：18:00/21:00/23:00）」。
    """

    def run(self, ctx):
        params = ctx.get('params', {}) or {}
        tier = params.get('spark_reminder')
        if tier == 18:
            text = '主人，今天还没陪我呢，来点个火续上连续陪伴吧～'
        elif tier == 21:
            text = '主人，都这个点了，再不来续火，我们的火花就要变弱啦。'
        elif tier == 23:
            text = '主人，最后一小时啦！再不续火，今天的火花就要熄灭咯。'
        else:
            text = ''
        return dict(behavior=self.name, tone='gentle', action_type=None,
                    tts_text=text, emotion_after='neutral',
                    params=dict(spark_reminder=tier))


class SparkStatusReactionAction(Action):
    """火花状态反应（W5）：续火 / 首次点燃 / 熄灭后挽回 的行为+回复联动。

    事件由引擎 on_event('spark', event_value) 进入；供决策引擎双栈统一调度。
    """

    def run(self, ctx):
        ev = ctx.get('event_value')
        params = ctx.get('params', {}) or {}
        days = params.get('spark_days', 0)
        if ev == 'keep':
            text = f'火花续上啦！已连续陪伴 {days} 天，今天也一起加油！'
        elif ev == 'new':
            text = '我们的火花点亮啦！从今天开始，我会一直陪着你～'
        elif ev == 'recover':
            text = '主人你回来啦！火花重新燃起，我不会再弄丢我们的陪伴了。'
        elif ev == 'extinguish':
            text = '（火花熄灭了…）主人，回来再续个火好不好？'
        else:
            text = ''
        return dict(behavior=self.name, tone='cheer' if ev != 'extinguish' else 'sad',
                    action_type=None, tts_text=text,
                    emotion_after='happy' if ev != 'extinguish' else 'neutral',
                    params=dict(spark_event=ev, spark_days=days))
