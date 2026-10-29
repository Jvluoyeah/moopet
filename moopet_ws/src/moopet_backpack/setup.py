from setuptools import find_packages, setup

package_name = 'moopet_backpack'

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
    description='背包盒子仿真感知节点：audio/vision/env/touch + heartbeat',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'heartbeat_node = moopet_backpack.heartbeat_node:main',
            'audio_node    = moopet_backpack.audio_node:main',
            'vision_node   = moopet_backpack.vision_node:main',
            'env_node      = moopet_backpack.env_node:main',
            'touch_node    = moopet_backpack.touch_node:main',
            'tts_node      = moopet_backpack.tts_node:main',
        ],
    },
)
