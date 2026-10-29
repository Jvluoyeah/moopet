#!/usr/bin/env python3
"""把契约检查接入 link_lab 的测试运行器。"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
sys.path.insert(0, LAB)
sys.path.insert(0, HERE)

import contract as C  # noqa: E402


def test_spec_interfaces_all_exist():
    C.test_spec_interfaces_all_exist()


def test_no_undocumented_interfaces():
    C.test_no_undocumented_interfaces()


def test_interface_count_at_least_sixteen():
    C.test_interface_count_at_least_sixteen()


def test_topics_declared_and_unique():
    C.test_topics_declared_and_unique()


def test_service_action_rows_resolve():
    C.test_service_action_rows_resolve()


def test_exp_sources_match_spec():
    C.test_exp_sources_match_spec()


def test_weekly_total_limit_documented():
    C.test_weekly_total_limit_documented()


def test_console_scripts_resolve_to_modules():
    C.test_console_scripts_resolve_to_modules()


def test_link_package_has_no_ros_requirement_in_core_paths():
    C.test_link_package_has_no_ros_requirement_in_core_paths()
