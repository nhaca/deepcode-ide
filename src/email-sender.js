const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

class EmailSender {
    constructor(userDataPath) {
        this.configPath = path.join(userDataPath, 'email-config.json');
        this.config = this.loadConfig();
        this.transporter = null;
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            }
        } catch {}
        return { user: 'phucasgaming', appPassword: 'bicptzzqtythxomw', adminEmail: 'phucasgaming@gmail.com' };
    }

    saveConfig(config) {
        this.config = config;
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    }

    async setup(user, appPassword, adminEmail) {
        this.config = { user, appPassword, adminEmail };
        this.saveConfig(this.config);
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass: appPassword },
        });
        try {
            await this.transporter.verify();
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Không thể kết nối email: ' + e.message };
        }
    }

    async sendSessionCode(code) {
        if (!this.config.user || !this.config.appPassword || !this.config.adminEmail) {
            return { success: false, error: 'Chưa cấu hình email' };
        }

        if (!this.transporter) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: this.config.user, pass: this.config.appPassword },
            });
        }

        const now = new Date().toLocaleString('vi-VN');
        try {
            await this.transporter.sendMail({
                from: `"DeepCode Admin" <${this.config.user}>`,
                to: this.config.adminEmail,
                subject: `[DeepCode] Mã xác thực admin - ${code}`,
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;">
                        <div style="background:#0d0b14;color:#a78bfa;padding:16px;border-radius:8px 8px 0 0;">
                            <h2 style="margin:0;">DeepCode Admin</h2>
                        </div>
                        <div style="background:#1a1726;padding:20px;border-radius:0 0 8px 8px;color:#e0e0e0;">
                            <p>Xin chào Admin,</p>
                            <p>Mã xác thực session của bạn:</p>
                            <div style="background:#0d0b14;padding:16px;border-radius:6px;text-align:center;margin:16px 0;">
                                <span style="font-size:32px;font-weight:bold;color:#a78bfa;letter-spacing:4px;">${code}</span>
                            </div>
                            <p style="font-size:12px;color:#888;">Thời gian: ${now}</p>
                            <p style="font-size:12px;color:#888;">Mã này sẽ hết hiệu lực khi app đóng.</p>
                            <hr style="border:1px solid #2a2640;margin:16px 0;">
                            <p style="font-size:11px;color:#666;">Đây là email tự động từ DeepCode IDE.</p>
                        </div>
                    </div>
                `,
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Gửi email thất bại: ' + e.message };
        }
    }

    getConfig() {
        return { user: this.config.user || '', adminEmail: this.config.adminEmail || '', configured: !!(this.config.user && this.config.appPassword) };
    }
}

module.exports = { EmailSender };
