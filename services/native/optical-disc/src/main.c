/* Optical-disc service boundary. Linux already supplies SCSI, block, UDF, and
 * optical drivers; PARA should coordinate them through udev/udisks2 later. */
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--describe") != 0) {
        fputs("para-optical-service: use --describe\n", stderr);
        return 2;
    }
    puts("{\"service\":\"optical-disc\",\"status\":\"interface-only\",\"linux_driver_reuse\":[\"sr_mod\",\"sg\",\"UDF\",\"udisks2\"],\"operations_exposed\":false}");
    return 0;
}
