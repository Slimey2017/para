cmake_minimum_required(VERSION 3.16)
project(pulsewave_controller_stub LANGUAGES CXX)
add_executable(pulsewave-controller-stub src/main.cpp)
target_compile_features(pulsewave-controller-stub PRIVATE cxx_std_17)
target_compile_options(pulsewave-controller-stub PRIVATE -Wall -Wextra -Wpedantic)

