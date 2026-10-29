from setuptools import find_packages, setup

package_name = 'moopet_link'

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
    description='狗↔背包通信层：信封协议/心跳/离线队列/断连自治/故障注入',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'link_doctor = moopet_link.doctor:main',
        ],
    },
)
