from setuptools import find_packages, setup

package_name = 'moopet_deploy'

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
    description='部署档位与大脑宿主：MOOPET_BRAIN=dog|backpack|sim 决定大脑跑在哪一侧，支持断连自治',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'moopet_doctor = moopet_deploy.doctor:main',
            'brain_host = moopet_deploy.brain_host:main'
        ],
    },
)
