import { MailService } from '@sendgrid/mail';
import nodemailer from 'nodemailer';

// Check for email service configuration
const useGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
const useOutlook = process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD;
const useYahoo = process.env.YAHOO_USER && process.env.YAHOO_PASSWORD;
const useGenericSMTP = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD;
const useSendGrid = process.env.SENDGRID_API_KEY;

const hasEmailService = useGmail || useOutlook || useYahoo || useGenericSMTP || useSendGrid;

if (!hasEmailService) {
  console.log('No email service configured - email and SMS alerts disabled');
  console.log('Available options:');
  console.log('1. SendGrid: SENDGRID_API_KEY (recommended - 100 free emails/day)');
  console.log('2. Outlook: OUTLOOK_USER + OUTLOOK_PASSWORD');
  console.log('3. Yahoo: YAHOO_USER + YAHOO_PASSWORD');
  console.log('4. Generic SMTP: SMTP_HOST + SMTP_USER + SMTP_PASSWORD + SMTP_PORT');
  console.log('5. Gmail: GMAIL_USER + GMAIL_APP_PASSWORD (requires App Password)');
}

// Initialize SendGrid if available
const mailService = new MailService();
if (useSendGrid) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY!);
}

// Initialize email transporter with multiple provider support
let emailTransporter: any = null;

if (useGmail) {
  // Gmail with App Password
  emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
} else if (process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD) {
  // Outlook/Hotmail (easier than Gmail)
  emailTransporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASSWORD
    }
  });
} else if (process.env.YAHOO_USER && process.env.YAHOO_PASSWORD) {
  // Yahoo Mail
  emailTransporter = nodemailer.createTransport({
    service: 'yahoo',
    auth: {
      user: process.env.YAHOO_USER,
      pass: process.env.YAHOO_PASSWORD
    }
  });
} else if (process.env.SMTP_HOST) {
  // Generic SMTP (for any email provider)
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

// SMS Carrier Email Gateways
const smsGateways: Record<string, { sms: string; mms: string }> = {
  'ATT': { sms: '@txt.att.net', mms: '@mms.att.net' },
  'Boost': { sms: '@sms.myboostmobile.com', mms: '@myboostmobile.com' },
  'C-Spire': { sms: '@cspire1.com', mms: '@cspire1.com' },
  'Consumer Cellular': { sms: '@mailmymobile.net', mms: '@mailmymobile.net' },
  'Cricket': { sms: '@sms.cricketwireless.net', mms: '@mms.cricketwireless.net' },
  'Google Fi': { sms: '@msg.fi.google.com', mms: '@msg.fi.google.com' },
  'H2O Wireless': { sms: '@txt.att.net', mms: '@mms.att.net' },
  'Metro': { sms: '@mymetropcs.com', mms: '@mymetropcs.com' },
  'Mint Mobile': { sms: '@tmomail.net', mms: '@tmomail.net' },
  'Page Plus': { sms: '@vtext.com', mms: '@vzwpix.com' },
  'Pure Talk': { sms: '@txt.att.net', mms: '@mms.att.net' },
  'Simple Mobile': { sms: '@smtext.com', mms: '@smtext.com' },
  'T-Mobile': { sms: '@tmomail.net', mms: '@tmomail.net' },
  'Tello': { sms: '@tmomail.net', mms: '@tmomail.net' },
  'Ting GSM': { sms: '@tmomail.net', mms: '@tmomail.net' },
  'Ting CDMA': { sms: '@message.ting.com', mms: '@message.ting.com' },
  'Tracfone': { sms: '@mmst5.tracfone.com', mms: '@mmst5.tracfone.com' },
  'Twigby': { sms: '@vtext.com', mms: '@vzwpix.com' },
  'Ultra Mobile': { sms: '@mailmymobile.net', mms: '@mailmymobile.net' },
  'US Cellular': { sms: '@email.uscc.net', mms: '@mms.uscc.net' },
  'US Mobile': { sms: '@vtext.com', mms: '@vzwpix.com' },
  'Verizon': { sms: '@vtext.com', mms: '@vzwpix.com' },
  'Visible': { sms: '@vtext.com', mms: '@vzwpix.com' },
  'Xfinity Mobile': { sms: '@vtext.com', mms: '@vzwpix.com' }
};

interface StormAlertEmailParams {
  to: string;
  name: string;
  locationName: string;
  stormIntensity: number;
  stormDistance: number;
  stormDirection: string;
  eta?: string;
  impactChance: string;
  severity: string;
}

interface SMSAlertParams {
  phoneNumber: string;
  carrier: string;
  name: string;
  locationName: string;
  stormIntensity: number;
  stormDistance: number;
  stormDirection: string;
  impactChance: string;
  severity: string;
}

export async function sendStormAlert(params: StormAlertEmailParams): Promise<boolean> {
  if (!useGmail && !useSendGrid) {
    console.log("Email would be sent:", params);
    return false;
  }

  const intensityCategory = params.stormIntensity >= 61 ? 'Extreme' :
                           params.stormIntensity >= 55 ? 'Very Heavy' :
                           params.stormIntensity >= 46 ? 'Heavy' :
                           params.stormIntensity >= 35 ? 'Moderate' : 'Light';

  const subject = `⚡ Storm Alert: ${intensityCategory} storm ${params.stormDistance.toFixed(1)} miles away`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1e293b, #334155); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">⚡ StormTracker Alert</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Storm detected near ${params.locationName}</p>
      </div>
      
      <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; color: #334155;">
        <h2 style="color: #dc2626; margin-top: 0;">Storm Details</h2>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Intensity:</strong> ${params.stormIntensity} dBZ (${intensityCategory})</p>
          <p style="margin: 0 0 10px 0;"><strong>Distance:</strong> ${params.stormDistance.toFixed(1)} miles ${params.stormDirection}</p>
          <p style="margin: 0 0 10px 0;"><strong>Impact Chance:</strong> <span style="color: ${params.impactChance === 'High' ? '#dc2626' : params.impactChance === 'Medium' ? '#ea580c' : '#16a34a'}">${params.impactChance}</span></p>
          <p style="margin: 0 0 10px 0;"><strong>Severity:</strong> <span style="color: ${params.severity === 'High' ? '#dc2626' : params.severity === 'Medium' ? '#ea580c' : '#16a34a'}">${params.severity}</span></p>
          ${params.eta ? `<p style="margin: 0;"><strong>ETA:</strong> ${params.eta}</p>` : ''}
        </div>
        
        <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 0; color: #92400e;"><strong>⚠️ Recommended Actions:</strong></p>
          <ul style="margin: 10px 0 0 0; color: #92400e;">
            ${params.stormIntensity >= 55 ? `
              <li>Seek shelter indoors immediately</li>
              <li>Avoid windows and electrical appliances</li>
              <li>Monitor for tornado warnings</li>
            ` : params.stormIntensity >= 45 ? `
              <li>Stay indoors if possible</li>
              <li>Avoid driving in heavy rain</li>
              <li>Monitor weather conditions</li>
            ` : `
              <li>Be aware of changing weather conditions</li>
              <li>Consider postponing outdoor activities</li>
            `}
          </ul>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          This alert was sent to ${params.to} based on your StormTracker subscription for ${params.locationName}.
          <br><br>
          Stay safe!<br>
          StormTracker Team
        </p>
      </div>
    </div>
  `;

  try {
    if (useSendGrid) {
      // Send via SendGrid (preferred)
      await mailService.send({
        to: params.to,
        from: 'alerts@stormtracker.app',
        subject,
        html,
      });
      console.log(`Storm alert email sent via SendGrid to ${params.to}`);
    } else if (emailTransporter) {
      // Send via SMTP (Gmail, Outlook, Yahoo, or generic)
      const fromEmail = process.env.GMAIL_USER || process.env.OUTLOOK_USER || process.env.YAHOO_USER || process.env.SMTP_USER;
      await emailTransporter.sendMail({
        from: `"StormTracker Alerts" <${fromEmail}>`,
        to: params.to,
        subject,
        html,
      });
      const provider = useGmail ? 'Gmail' : useOutlook ? 'Outlook' : useYahoo ? 'Yahoo' : 'SMTP';
      console.log(`Storm alert email sent via ${provider} to ${params.to}`);
    } else {
      console.log('No email service configured - alert not sent');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}

interface TestAlertParams {
  to: string;
  name: string;
  locationName: string;
}

// Send SMS storm alert via carrier email gateway
export async function sendSMSAlert(params: SMSAlertParams): Promise<boolean> {
  if (!hasEmailService) {
    console.log("SMS would be sent:", params);
    return false;
  }

  const gateway = smsGateways[params.carrier];
  if (!gateway) {
    console.error(`Unknown carrier: ${params.carrier}`);
    return false;
  }

  // Format phone number (remove any non-digits)
  const cleanPhone = params.phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    console.error(`Invalid phone number: ${params.phoneNumber}`);
    return false;
  }

  const smsEmail = cleanPhone + gateway.sms;
  
  // Create concise SMS message (160 character limit)
  const intensityCategory = params.stormIntensity >= 61 ? 'EXTREME' :
                           params.stormIntensity >= 55 ? 'SEVERE' :
                           params.stormIntensity >= 46 ? 'HEAVY' : 'MODERATE';

  const message = `🌩️ STORM ALERT: ${intensityCategory} storm ${params.stormDistance.toFixed(1)}mi away from ${params.locationName}. ${params.stormIntensity}dBZ intensity. ${params.severity} risk. Stay safe! -StormTracker`;

  try {
    if (useSendGrid) {
      // Send via SendGrid (preferred)
      await mailService.send({
        to: smsEmail,
        from: 'alerts@stormtracker.app',
        subject: '', // SMS gateways ignore subject
        text: message, // Plain text for SMS
      });
      console.log(`SMS alert sent via SendGrid to ${cleanPhone} via ${params.carrier}`);
    } else if (emailTransporter) {
      // Send via SMTP provider
      const fromEmail = process.env.GMAIL_USER || process.env.OUTLOOK_USER || process.env.YAHOO_USER || process.env.SMTP_USER;
      await emailTransporter.sendMail({
        from: fromEmail,
        to: smsEmail,
        subject: '', // SMS gateways ignore subject
        text: message, // Plain text for SMS
      });
      const provider = useGmail ? 'Gmail' : useOutlook ? 'Outlook' : useYahoo ? 'Yahoo' : 'SMTP';
      console.log(`SMS alert sent via ${provider} to ${cleanPhone} via ${params.carrier}`);
    } else {
      console.log('No email service configured - SMS not sent');
      return false;
    }
    return true;
  } catch (error) {
    console.error('SMS alert error:', error);
    return false;
  }
}

// Send test SMS
export async function sendTestSMS(phoneNumber: string, carrier: string, name: string, locationName: string): Promise<boolean> {
  if (!hasEmailService) {
    console.log("Test SMS would be sent:", { phoneNumber, carrier });
    return false;
  }

  const gateway = smsGateways[carrier];
  if (!gateway) {
    console.error(`Unknown carrier: ${carrier}`);
    return false;
  }

  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    console.error(`Invalid phone number: ${phoneNumber}`);
    return false;
  }

  const smsEmail = cleanPhone + gateway.sms;
  const message = `✅ StormTracker SMS alerts active for ${locationName}. You'll get instant text alerts when storms approach. Reply STOP to opt out. -StormTracker`;

  try {
    if (useSendGrid) {
      // Send via SendGrid (preferred)
      await mailService.send({
        to: smsEmail,
        from: 'alerts@stormtracker.app',
        subject: '',
        text: message,
      });
      console.log(`Test SMS sent via SendGrid to ${cleanPhone} via ${carrier}`);
    } else if (emailTransporter) {
      // Send via SMTP provider
      const fromEmail = process.env.GMAIL_USER || process.env.OUTLOOK_USER || process.env.YAHOO_USER || process.env.SMTP_USER;
      await emailTransporter.sendMail({
        from: fromEmail,
        to: smsEmail,
        subject: '',
        text: message,
      });
      const provider = useGmail ? 'Gmail' : useOutlook ? 'Outlook' : useYahoo ? 'Yahoo' : 'SMTP';
      console.log(`Test SMS sent via ${provider} to ${cleanPhone} via ${carrier}`);
    } else {
      console.log('No email service configured - test SMS not sent');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Test SMS error:', error);
    return false;
  }
}

export async function sendTestAlert(params: TestAlertParams): Promise<boolean> {
  if (!hasEmailService) {
    console.log("Test email would be sent:", params);
    return false;
  }

  const subject = `✅ StormTracker Test Alert - Setup Complete`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">✅ StormTracker Setup Complete</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Test alert for ${params.locationName}</p>
      </div>
      
      <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; color: #334155;">
        <h2 style="color: #059669; margin-top: 0;">Hello ${params.name}!</h2>
        
        <p>Your StormTracker alert subscription is now active and monitoring for storms near <strong>${params.locationName}</strong>.</p>
        
        <div style="background: #f0f9ff; border: 1px solid #0284c7; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 0; color: #0c4a6e;"><strong>🌩️ What happens next?</strong></p>
          <ul style="margin: 10px 0 0 0; color: #0c4a6e;">
            <li>We'll monitor for storms within your alert radius</li>
            <li>You'll get email and SMS alerts when storms meet your intensity threshold</li>
            <li>Alerts include storm details, movement, and safety recommendations</li>
            <li>No spam - alerts are limited to prevent notification fatigue</li>
          </ul>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          This test confirms your alerts are working properly.
          <br><br>
          Stay safe and informed!<br>
          StormTracker Team
        </p>
      </div>
    </div>
  `;

  try {
    if (useSendGrid) {
      // Send via SendGrid (preferred)
      await mailService.send({
        to: params.to,
        from: 'alerts@stormtracker.app',
        subject,
        html,
      });
      console.log(`Test alert email sent via SendGrid to ${params.to}`);
    } else if (emailTransporter) {
      // Send via SMTP provider
      const fromEmail = process.env.GMAIL_USER || process.env.OUTLOOK_USER || process.env.YAHOO_USER || process.env.SMTP_USER;
      await emailTransporter.sendMail({
        from: `"StormTracker Alerts" <${fromEmail}>`,
        to: params.to,
        subject,
        html,
      });
      const provider = useGmail ? 'Gmail' : useOutlook ? 'Outlook' : useYahoo ? 'Yahoo' : 'SMTP';
      console.log(`Test alert email sent via ${provider} to ${params.to}`);
    } else {
      console.log('No email service configured - test email not sent');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Test email error:', error);
    return false;
  }
}