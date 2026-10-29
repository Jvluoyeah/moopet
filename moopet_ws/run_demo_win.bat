@echo off
rem 养成系机械狗 · 无 ROS 独立演示（Windows 一键运行）
rem 依赖：仅需安装 Python 3（https://www.python.org），无需 ROS2
rem 默认运行 W3 演示（W1→W2→W3 一条时间轴）；加参数可切换：
rem   run_demo_win.bat interactive    互动答题养狗
rem   run_demo_win.bat w2             W2 独立演示
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if "%1"=="interactive" goto inter
if "%1"=="w2" goto w2
python standalone_demo_w3.py
goto end
:inter
python standalone_demo_w3.py --interactive
goto end
:w2
python standalone_demo.py
:end
pause
