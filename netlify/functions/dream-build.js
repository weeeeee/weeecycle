exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { firstName, lastName, email, phone, description, contactMethod } = body;
    if (!firstName || !lastName || !email || !description) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'RESEND_API_KEY is not set.' })
        };
    }

    const date = new Date().toLocaleString();

    async function sendEmail(payload) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    }

    const adminResult = await sendEmail({
        from: 'Weeecycle Dream Build <onboarding@resend.dev>',
        to: ['swhitelex@gmail.com'],
        subject: `New Dream Build Request — ${firstName} ${lastName}`,
        html: `
            <h2 style="font-family:sans-serif;color:#ff8000;">New Dream Build Consultation</h2>
            <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse;width:100%;max-width:560px;">
                <tr><td style="padding:8px 12px;color:#888;width:140px;">Name</td><td style="padding:8px 12px;">${firstName} ${lastName}</td></tr>
                <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Email</td><td style="padding:8px 12px;">${email}</td></tr>
                <tr><td style="padding:8px 12px;color:#888;">Phone</td><td style="padding:8px 12px;">${phone || 'Not provided'}</td></tr>
                <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Contact via</td><td style="padding:8px 12px;">${contactMethod || 'email'}</td></tr>
                <tr><td style="padding:8px 12px;color:#888;vertical-align:top;">Description</td><td style="padding:8px 12px;">${description.replace(/\n/g, '<br>')}</td></tr>
                <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Submitted</td><td style="padding:8px 12px;">${date}</td></tr>
            </table>
        `
    });

    console.log('Admin email result:', JSON.stringify(adminResult));

    const customerResult = await sendEmail({
        from: 'Weeecycle Dream Build <onboarding@resend.dev>',
        to: [email],
        subject: 'We received your Dream Build request!',
        html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:30px;">
                <h2 style="color:#ff8000;text-transform:uppercase;margin-top:0;">Build the Dream</h2>
                <p>Hi ${firstName},</p>
                <p>Thanks for reaching out! We've received your Dream Build request and Steve will be reviewing your vision shortly.</p>
                <p><strong>We'll reach out via your preferred method (${contactMethod || 'email'}) soon.</strong></p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                <p style="font-size:0.9em;color:#666;"><strong>Your request summary:</strong><br>${description.substring(0, 200)}${description.length > 200 ? '...' : ''}</p>
                <p style="margin-top:30px;font-weight:bold;">WEEECYCLE.NET</p>
            </div>
        `
    });

    console.log('Customer email result:', JSON.stringify(customerResult));

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: adminResult.ok,
            adminEmail: adminResult,
            customerEmail: customerResult
        })
    };
};
