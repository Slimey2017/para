cmake_minimum_required(VERSION 3.16)
project(para_optical_stub LANGUAGES C)
add_executable(para-optical-stub src/main.c)
target_compile_features(para-optical-stub PRIVATE c_std_11)
target_compile_options(para-optical-stub PRIVATE -Wall -Wextra -Wpedantic)

