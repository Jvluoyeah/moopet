from setuptools import find_packages, setup

package_name = 'moopet_core'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['tests', 'tests.*']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/data', ['moopet_core/data/schema.sql']),
    ],
    package_data={'moopet_core': ['data/*.sql']},
    install_requires=['setuptools'],
    zip_safe=False,
    maintainer='李文扬',
    maintainer_email='liwenyang@moopet.local',
    description='纯逻辑大脑：经验结算/等级/火花/行为决策/日记/题库（零 ROS 依赖，可搬家）',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={'console_scripts': []},
)
