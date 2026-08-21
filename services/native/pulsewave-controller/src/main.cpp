// PulseWave native service boundary. This program intentionally performs no
// Bluetooth pairing, USB claiming, firmware update, or evdev interception.
#include <iostream>
#include <string_view>

int main(int argc, char** argv) {
    const bool describe = argc == 2 && std::string_view(argv[1]) == "--describe";
    if (!describe) {
        std::cerr << "pulsewave-controller-stub: use --describe; native pairing is not implemented\n";
        return 2;
    }
    std::cout
        << R"({"service":"pulsewave-controller","status":"stub","browser_fallback":"Gamepad API","native_pairing":false,"haptics":false,"firmware_updates":false})"
        << '\n';
    return 0;
}

