import { env, isProduction } from '../env';
import { log } from '../logger';

/**
 * SMS adapter. Only the dev-log implementation exists until an SMS vendor with DLT
 * registration is chosen (decisions.md V-03). It never sends a real SMS.
 */
export interface SmsSender {
  readonly name: string;
  readonly sandbox: boolean;
  sendOtp(phoneE164: string, code: string): Promise<void>;
  send(phoneE164: string, template: string, vars: Record<string, string>): Promise<void>;
}

const devLog: SmsSender = {
  name: 'dev-log',
  sandbox: true,
  async sendOtp(phone, code) {
    if (isProduction()) throw new Error('dev-log SMS adapter cannot run in production');
    // Visible only in local/staging server logs. Phone is masked; the code is shown so testers can sign in.
    console.info(`[DEV SMS] OTP for ${phone.slice(0, 3)}******${phone.slice(-4)}: ${code}`);
  },
  async send(phone, template) {
    if (isProduction()) throw new Error('dev-log SMS adapter cannot run in production');
    log.info('dev sms', { template, to: phone });
  },
};

export function smsSender(): SmsSender {
  switch (env().SMS_PROVIDER) {
    case 'dev-log':
      return devLog;
  }
}
