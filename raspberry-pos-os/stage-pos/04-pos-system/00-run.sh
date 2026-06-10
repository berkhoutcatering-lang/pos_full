#!/bin/bash -e

# Install POS system pieces: provisioning, services, web app, kiosk,
# pos.env template.

install -m 755 files/pos-provision.sh "${ROOTFS_DIR}/usr/local/bin/pos-provision.sh"
install -m 755 files/pos-kiosk.sh "${ROOTFS_DIR}/usr/local/bin/pos-kiosk.sh"

install -m 644 files/pi-bridge.service "${ROOTFS_DIR}/etc/systemd/system/pi-bridge.service"
install -m 644 files/pos-web.service "${ROOTFS_DIR}/etc/systemd/system/pos-web.service"
install -m 644 files/pos-provision.service "${ROOTFS_DIR}/etc/systemd/system/pos-provision.service"
install -m 644 files/pos-kiosk.service "${ROOTFS_DIR}/etc/systemd/system/pos-kiosk.service"
install -m 644 files/pos-chain-verify.service "${ROOTFS_DIR}/etc/systemd/system/pos-chain-verify.service"
install -m 644 files/pos-chain-verify.timer "${ROOTFS_DIR}/etc/systemd/system/pos-chain-verify.timer"

# nginx: TLS in front of the local web app. The site is installed now but
# nginx itself is enabled by pos-provision.sh once the cert exists.
install -m 644 files/nginx-pos.conf "${ROOTFS_DIR}/etc/nginx/sites-available/pos"
rm -f "${ROOTFS_DIR}/etc/nginx/sites-enabled/default"
ln -sf ../sites-available/pos "${ROOTFS_DIR}/etc/nginx/sites-enabled/pos"

# pos.env: template in the rootfs + a copy on the FAT boot partition so it
# can be edited from Windows/macOS after flashing.
install -d "${ROOTFS_DIR}/usr/share/pos"
install -m 644 files/pos.env "${ROOTFS_DIR}/usr/share/pos/pos.env.template"
install -d "${ROOTFS_DIR}/boot/firmware/pos-setup"
install -m 644 files/pos.env "${ROOTFS_DIR}/boot/firmware/pos-setup/pos.env"

on_chroot << EOF
systemctl enable pos-provision.service
systemctl enable pi-bridge.service
systemctl enable pos-web.service
systemctl enable pos-chain-verify.timer
systemctl enable avahi-daemon.service
systemctl enable ssh
# nginx needs the provisioned TLS cert; pos-provision.sh enables+starts it.
systemctl disable nginx.service 2>/dev/null || true
# Kiosk is enabled/disabled at boot by pos-provision.sh based on KIOSK_URL.
systemctl disable pos-kiosk.service 2>/dev/null || true
EOF
