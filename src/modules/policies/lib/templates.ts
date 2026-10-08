/**
 * Starting texts HR can pick when creating a policy. Everything the company must
 * decide is in [square brackets]; publishing is refused while any are left.
 */

export interface PolicyTemplate {
  id: string;
  title: string;
  summary: string;
  body: (company: string) => string;
}

const codeOfConduct = (c: string) => `# ${c} Code of Conduct

This Code describes how everyone at ${c} is expected to work, behave and treat one another, our clients and our partners. It applies from the day you join until the day you leave: in the office, at company events and online. By signing it you confirm that you have read and understood it and that you agree to follow it.

## 1. Who this applies to

This Code applies to every employee of ${c}, whether permanent, on probation, on contract or an intern. Team leads and managers are expected to follow it first and to set the example for their teams.

## 2. What we stand for

- **Respect.** Treat every colleague, client and visitor with courtesy, whatever their position, gender, age, religion, ethnicity, language or background.
- **Honesty.** Record your time, your work and your data truthfully. Never falsify a record, a signature or a report.
- **Responsibility.** Own your work and your deadlines. If something goes wrong, raise it early.

## 3. Attendance and working hours

- Office hours are [09:00 to 18:00, Monday to Friday], unless HR announces different timings.
- Record your attendance yourself every day. Recording attendance for someone else is serious misconduct.
- Apply for leave in the employee portal in advance. For sudden illness or an emergency, tell your team lead and HR as early as you can.

## 4. Behaviour at work

- Be polite and professional in speech, in messages and in e-mail. Abusive language, threats and bullying are not acceptable, in person or online.
- Dress in a way that suits an office and meeting clients.
- Keep shared spaces clean and respect your colleagues' time for prayer and their religious and cultural practices.
- Alcohol, illegal drugs and weapons are not allowed at work or at any work event.

## 5. Harassment and discrimination

${c} does not tolerate harassment of any kind. Harassment includes unwelcome advances, remarks, jokes, gestures, messages or images of a sexual nature, and any behaviour that makes someone feel intimidated, humiliated or unsafe.

- Discrimination because of gender, religion, ethnicity, language, disability, age or background is not allowed in any decision.
- Report harassment to HR or to the Inquiry Committee: [name and designation] and [name and designation].
- Nobody who reports in good faith will suffer for it.

## 6. Confidentiality and data

- Client data, contracts, prices, source code and anything else that is not public belongs to ${c} and its clients. Use it only for your work.
- Colleagues' personal details, salaries and HR records are private.
- Report a lost device or any suspected leak of data to IT and HR at once. These duties continue after you leave.

## 7. Company equipment and accounts

- Look after the equipment issued to you and return it in good condition when asked or when you leave.
- Keep your passwords to yourself and never use someone else's account.

## 8. Conflicts of interest and gifts

Avoid any situation where your own interest could conflict with the company's, and declare any such situation to HR. Do not accept or offer cash, commissions or expensive gifts from or to clients or suppliers.

## 9. Breaking this Code

Breaking this Code can lead to disciplinary action. Depending on how serious it is and whether it is repeated, the steps are usually:

1. A verbal warning.
2. A written explanation letter, asking for your side within three working days.
3. A written warning.
4. A final written warning.
5. Termination of employment.

Gross misconduct, such as fraud, theft, falsifying records, harassment or leaking confidential data, may lead straight to suspension or termination. You will always be told what you are accused of and given the chance to explain before a decision is made.

## 10. Acknowledgement

This Code is a condition of working at ${c}. HR may update it; when it changes, you will be asked to read and sign the new version in the employee portal. If anything in it is unclear, ask HR before you sign.
`;

const itPolicy = (c: string) => `# IT and Data Security Policy

This policy explains how everyone at ${c} must use company devices, accounts and data so that our clients' information and our own stay safe.

## 1. Accounts and passwords

- Use a strong, unique password for every company account and turn on two-step verification where it is offered.
- Never share your password or let someone else use your account. IT will never ask for your password.
- Lock your screen whenever you leave your desk.

## 2. Devices

- Company laptops and phones are for work. Install only software approved by IT, and keep the operating system and antivirus up to date.
- Do not switch off security settings, disk encryption or device management.
- Report a lost or stolen device to [IT contact] within one hour.

## 3. Data

- Store company data only in approved systems: [list the approved systems].
- Do not copy company or client data to personal devices, personal e-mail or personal cloud storage.
- Share files with people outside the company only when your work requires it, and only through approved tools.

## 4. E-mail and messages

- Be careful with links and attachments. If a message is unexpected or asks for passwords, payments or urgent action, check with the sender by another channel and report it to IT.

## 5. Monitoring

Company systems may be monitored to protect company and client data, in line with the law.

## 6. Breaking this policy

Breaking this policy may lead to disciplinary action under the Code of Conduct, and serious breaches may be reported to the authorities.
`;

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "code-of-conduct",
    title: "Code of Conduct",
    summary: "How we work, behave and treat one another, our clients and our partners.",
    body: codeOfConduct,
  },
  {
    id: "it-security",
    title: "IT and Data Security Policy",
    summary: "How we use company devices, accounts and data safely.",
    body: itPolicy,
  },
];
