from setuptools import find_packages, setup

package_name = 'moopet_hal'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['tests', 'tests.*']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='李文扬',
    maintainer_email='liwenyang@moopet.local',
    description='硬件抽象层：感知来源（仿真/回放/真机）与执行器（打印/模拟/录制），让大脑不关心自己在跟谁说话',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [

        ],
    },
)
