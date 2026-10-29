"""种子数据：8 个品种 + 公开社群。

品种形象走"分层 SVG 形象包"规范（见 docs/形象包规范.md）：
asset_pack 指向 web/public/breeds/<code>/ 目录，palette 是该品种的毛色槽位。
**刻意不用 emoji** —— 形象一律由分层矢量资源渲染，图片到位后按同一规范替换即可。

四维（体力/敏捷/智力/亲和）同时被社群互动与对战使用：
  * 对战：体力影响耐久、敏捷影响移动与出手、智力影响技能、亲和影响团队加成
  * 社群：亲和影响互动收益，智力影响答题类互动
"""
from .models import Breed, Community

PUBLIC_COMMUNITY = dict(
    code='plaza',
    name='长夜月广场',
    kind='public',
    description='长夜月里唯一还亮着一排路灯的地方。在这里能看到大家的狗、串门、对拍。',
)

BREEDS = [
    dict(code='samoyed', name='萨摩耶', subtitle='微笑天使',
         power=72, agility=58, wisdom=60, affinity=88, sort_order=1,
         palette={'fur': '#F7F4EC', 'accent': '#D8D2C4', 'nose': '#2B2A28'},
         description='记「谁对它好」记得最多，几乎跟长夜里的任何人都能玩到一起。代价是对危险极度迟钝。'),
    dict(code='border_collie', name='边境牧羊犬', subtitle='智力天花板',
         power=60, agility=82, wisdom=95, affinity=64, sort_order=2,
         palette={'fur': '#25231F', 'accent': '#F5F2EA', 'nose': '#1A1917'},
         description='曾自己用鼻尖顶开铁栅栏的聪明家伙。学什么都快，也因此极易厌倦，常独自陷入漫长的自检。'),
    dict(code='golden', name='金毛寻回犬', subtitle='温柔大个子',
         power=76, agility=62, wisdom=74, affinity=86, sort_order=3,
         palette={'fur': '#E4C07A', 'accent': '#F2E0B6', 'nose': '#2E2A22'},
         description='为独居老人叼了整整十年报纸。四维平得令人心碎，不争不抢，连食物被夺走也只是安静地趴着。'),
    dict(code='corgi', name='柯基', subtitle='短腿电臀',
         power=64, agility=70, wisdom=72, affinity=80, sort_order=4,
         palette={'fur': '#E8A85C', 'accent': '#FBF6EC', 'nose': '#33291F'},
         description='重心低矮、耐力极佳。即便落后半步，也绝不掉队的倔强小矮子。'),
    dict(code='shiba', name='柴犬', subtitle='独立小狐狸',
         power=58, agility=84, wisdom=70, affinity=52, sort_order=5,
         palette={'fur': '#C9762F', 'accent': '#F6EFE2', 'nose': '#2C2620'},
         description='只认一个主人。认人极慢——但认了，就认一辈子。'),
    dict(code='german_shepherd', name='德国牧羊犬', subtitle='可靠守卫',
         power=88, agility=66, wisdom=84, affinity=70, sort_order=6,
         palette={'fur': '#5B4630', 'accent': '#2A231B', 'nose': '#181510'},
         description='警觉与骨架都拉到顶。夜里守着整条巷道，从不比主人先闭上双眼的苦行僧。'),
    dict(code='husky', name='哈士奇', subtitle='雪原话痨',
         power=80, agility=80, wisdom=54, affinity=68, sort_order=7,
         palette={'fur': '#6E7480', 'accent': '#F4F6F8', 'nose': '#242830'},
         description='跑得极快，神经传导永远跟不上四肢。一团不肯安静下来的狂乱风暴。'),
    dict(code='bichon', name='比熊', subtitle='棉花糖',
         power=48, agility=74, wisdom=66, affinity=92, sort_order=8,
         palette={'fur': '#FBF8F2', 'accent': '#E9E2D6', 'nose': '#332E28'},
         description='蜷在膝头，最会察言观色，也最孱弱。需要被小心捧着的脆弱棉团。'),
]


def seed_all(db):
    """幂等写入：已存在则更新（方便调整数值后重跑）。"""
    created = {'breeds': 0, 'communities': 0}
    for row in BREEDS:
        b = db.get(Breed, row['code'])
        if b is None:
            db.add(Breed(**row))
            created['breeds'] += 1
        else:
            for k, v in row.items():
                setattr(b, k, v)
    c = db.query(Community).filter(Community.code == PUBLIC_COMMUNITY['code']).first()
    if c is None:
        db.add(Community(**PUBLIC_COMMUNITY))
        created['communities'] += 1
    else:
        for k, v in PUBLIC_COMMUNITY.items():
            setattr(c, k, v)
    db.commit()
    return created


def public_community(db):
    return db.query(Community).filter(Community.code == PUBLIC_COMMUNITY['code']).first()


# ---------------- 演示用 NPC 狗 ----------------
# 广场上要有人，演示才好看。这些是**预置演示数据**（黄鑫禹 W6 的"预置演示数据"同款思路），
# 由服务端按时间片惰性刷新位置，因此不需要后台任务也不会"看起来是死的"。
DEMO_DOGS = [
    # 八只 NPC 狗各照自己**原型**那句话说话（原型描述见 BREEDS，
    # 出处是小说第一章『铭刻于虚无核心的八个灵魂』）。
    # 原来这些偏跳脱（"今天也要开开心心"、"啊啊啊啊——"），
    # 和现在这批品种描述不是一套语气。口头禅是人写在卡纸上的那句话，
    # 所以每句都该像"一个人天天对狗说的话"，而不是狗在卖萌。
    dict(name='雪团', breed_code='samoyed', level=18, personality='粘人型',
         motto='我认得你。'),
    dict(name='阿牧', breed_code='border_collie', level=27, personality='独立型',
         motto='这道题，你会做吗。'),
    dict(name='大金', breed_code='golden', level=22, personality='粘人型',
         motto='不急，我等你。'),
    dict(name='短腿', breed_code='corgi', level=15, personality='话痨型',
         motto='落后半步也跟得上。'),
    dict(name='小柴', breed_code='shiba', level=20, personality='安静型',
         motto='认人很慢，别急。'),
    dict(name='黑背', breed_code='german_shepherd', level=31, personality='独立型',
         motto='这边我看着，你睡。'),
    dict(name='二哈', breed_code='husky', level=12, personality='话痨型',
         motto='跑起来就停不下！'),
    dict(name='棉花', breed_code='bichon', level=9, personality='粘人型',
         motto='抱一下，好不好。'),
]


def seed_demo_dogs(db, count=8):
    """幂等：创建 NPC 账号 + 狗 + 社群成员 + 在线状态 + 排行榜条目。"""
    from .models import (Account, CommunityMember, DogProfile, LeaderboardEntry,
                         Presence)
    from . import world
    from .security import hash_password
    comm = public_community(db)
    made = 0
    for i, spec in enumerate(DEMO_DOGS[:max(0, count)]):
        username = f'demo_{spec["breed_code"]}'
        acc = db.query(Account).filter(Account.username == username).first()
        if acc is None:
            acc = Account(username=username, email='', role='demo',
                          password_hash=hash_password('demo-' + username))
            db.add(acc)
            db.flush()
        dog = (db.query(DogProfile)
                 .filter(DogProfile.account_id == acc.id,
                         DogProfile.name == spec['name']).first())
        if dog is None:
            dog = DogProfile(account_id=acc.id, name=spec['name'],
                             breed_code=spec['breed_code'], level=spec['level'],
                             total_exp=spec['level'] * 60,
                             personality=spec['personality'], motto=spec['motto'],
                             is_npc=True)
            db.add(dog)
            db.flush()
            made += 1
            if comm is not None:
                db.add(CommunityMember(community_id=comm.id, dog_id=dog.id,
                                       friendship_points=10 * (i + 1),
                                       social_level=1 + i // 3))
            for kind, score in (('level', dog.level), ('match', 0), ('social', 0)):
                db.add(LeaderboardEntry(kind=kind, dog_id=dog.id, score=score))
        else:
            # 幂等：已存在就按种子**覆盖可变字段**（和 seed_all 一个规矩）。
            # 原来这里是"存在就整段跳过" —— 于是改了 seeds.py 里的口头禅、
            # 等级、性格全都不生效，必须删库重建才看得见。
            # 文案是会被反复改的东西，刷新不了等于每次都白改。
            dog.breed_code = spec['breed_code']
            dog.level = spec['level']
            dog.total_exp = spec['level'] * 60
            dog.personality = spec['personality']
            dog.motto = spec['motto']
            dog.is_npc = True
        x, y = world.position_for(dog.id, scene='plaza')
        p = db.get(Presence, dog.id)
        if p is None:
            db.add(Presence(dog_id=dog.id, scene='plaza', x=x, y=y, status='walk',
                            bubble=world.bubble_for(dog.id, dog.breed_code)))
        else:
            p.x, p.y = x, y
    db.commit()
    return {'demo_dogs': made}
