const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
    const target = 'swhitelex@gmail.com';
    console.log("Testing email delivery to:", target);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: target,
            subject: 'Weeecycle Notification Test - Secondary Email',
            text: 'If you see this, the notification system is working and reaching your secondary Gmail address.',
            html: '<b>If you see this, the notification system is working and reaching your secondary Gmail address.</b>'
        });
        console.log("Email sent successfully. Response:", info.response);
    } catch (error) {
        console.error("Email test failed:", error);
    }
}

testEmail();
