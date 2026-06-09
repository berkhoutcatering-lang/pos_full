#!/bin/bash
# One-time WSL2 host prep for the pi-gen image build:
# static qemu-aarch64 + binfmt registration with the F (fix-binary) flag,
# so arm64 binaries run inside the build chroot.
# Run as root:  sed 's/\r$//' fix-binfmt-wsl.sh | bash
set -ex

export DEBIAN_FRONTEND=noninteractive
apt-get remove -y -qq qemu-user-binfmt qemu-user 2>/dev/null || true
apt-get install -y -qq --reinstall qemu-user-static
ls -la /usr/bin/qemu-aarch64-static

# pi-gen's build-docker.sh expects a binary named `qemu-aarch64` on PATH.
ln -sf /usr/bin/qemu-aarch64-static /usr/local/bin/qemu-aarch64

# Replace any existing aarch64 binfmt entries with one static F-flag entry.
for e in /proc/sys/fs/binfmt_misc/qemu-aarch64*; do
  [ -f "$e" ] && echo -1 > "$e" || true
done
echo ':qemu-aarch64:M::\x7f\x45\x4c\x46\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\xb7\x00:\xff\xff\xff\xff\xff\xff\xff\x00\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff\xff:/usr/local/bin/qemu-aarch64:F' > /proc/sys/fs/binfmt_misc/register
cat /proc/sys/fs/binfmt_misc/qemu-aarch64

# pi-gen's build-docker.sh wants an entry whose interpreter is exactly
# qemu-aarch64-static; pre-register its ':qemu-aarch64-rpi:' name so the
# script never falls into its own interactive `sudo` registration.
[ -f /proc/sys/fs/binfmt_misc/qemu-aarch64-rpi ] && echo -1 > /proc/sys/fs/binfmt_misc/qemu-aarch64-rpi
echo ':qemu-aarch64-rpi:M::\x7f\x45\x4c\x46\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\xb7\x00:\xff\xff\xff\xff\xff\xff\xff\x00\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff\xff:/usr/bin/qemu-aarch64-static:F' > /proc/sys/fs/binfmt_misc/register
cat /proc/sys/fs/binfmt_misc/qemu-aarch64-rpi

# Prove arm64 emulation works end-to-end (also inside containers).
docker run --rm --platform linux/arm64 debian:bookworm-slim uname -m
echo BINFMT_OK
