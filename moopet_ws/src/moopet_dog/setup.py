from setuptools import find_packages, setup

package_name = 'moopet_dog'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='李文扬',
    maintainer_email='liwenyang@moopet.local',
    description='狗本体：里程/状态管理/经验结算引擎 + 答题 + 行为决策引擎 + 冒烟测试',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'odom_node           = moopet_dog.odom_node:main',
            'exp_engine_node     = moopet_dog.exp_engine_node:main',
            'state_mgr_node      = moopet_dog.state_mgr_node:main',
            'smoke_test_node     = moopet_dog.smoke_test_node:main',
            'quiz_node           = moopet_dog.quiz_node:main',          # W3 答题
            'decision_engine_node = moopet_dog.decision_engine_node:main',  # W3 决策
        ],
    },
)
