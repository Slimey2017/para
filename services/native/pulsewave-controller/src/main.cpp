// PulseWave native service boundary. This program intentionally performs no
// Bluetooth pairing, USB claiming, firmware update, or evdev interception.
#include <iostream>
#include <string_view>

int main(int argc, char** argv) {
    const bool describe = argc == 2 && std::string_view(argv[1]) == "--describe";
    if (!describe) {
        std::cerr << "pulsewave-controller-service: use --describe\n";
        return 2;
    }
    std::cout
        << R"({"service":"pulsewave-controller","status":"interface-only","active_input":"Browser Gamepad API","native_operations_exposed":false})"
        << '\n';
    return 0;
}
