/* Optical-disc service boundary. Linux already supplies SCSI, block, UDF, and
 * optical drivers; PARA should coordinate them through udev/udisks2 later. */
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--describe") != 0) {
        fputs("para-optical-stub: use --describe; no media operations are implemented\n", stderr);
        return 2;
    }
    puts("{\"service\":\"optical-disc\",\"status\":\"stub\",\"linux_driver_reuse\":[\"sr_mod\",\"sg\",\"UDF\",\"udisks2\"],\"mounting\":false,\"eject\":false,\"drm\":false}");
    return 0;
}

