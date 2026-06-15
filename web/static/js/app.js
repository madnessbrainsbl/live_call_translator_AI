// ===== DOM refs =====
const chat = document.getElementById('chat');
const statusEl = document.getElementById('status');
const typingEl = document.getElementById('typing');
const toastEl = document.getElementById('toast');

// ===== State =====
const SYSTEM_LOOPBACK_DEVICE = '__system_output_loopback__';
const SYSTEM_LOOPBACK_LABEL = 'System output loopback (no microphone)';
const AI_MEMORY_KEY = 'translator-ai-memory-v1';
const AI_CALL_HISTORY_KEY = 'translator-ai-call-assistant-v1';
const AI_MEMORY_MAX = 12;
const AI_CALL_HISTORY_MAX = 80;
const AI_VISIBLE_CARD_MAX = 80;
const AI_MEMORY_CONTEXT_MAX = 600;
const AI_MEMORY_ANSWER_MAX = 900;
const AI_CALL_ANSWER_MAX = 8000;
const AI_PROMPT_MAX_CHARS = 20000;
const AI_PROMPT_TRUNCATION_MARKER = '...';
const AI_PROMPT_TEXT_TYPES = new Set(['', 'text/plain', 'text/markdown']);
const AI_PROMPT_FILE_EXTENSIONS = ['.txt', '.md', '.markdown'];
const AI_PROMPT_CONTEXTS = Object.freeze({
  res: Object.freeze({ settingsKey: 'ai_resume_prompt', buttonId: 'btn-res', title: 'res' }),
  vac: Object.freeze({ settingsKey: 'ai_vacancy_prompt', buttonId: 'btn-vac', title: 'vac' })
});
const SPEAKER_IDS = Object.freeze({
  outgoing: 'S1',
  incoming: 'S2'
});
const SPEAKER_ROLES = Object.freeze({
  outgoing: 'Mic Out / You',
  incoming: 'Mic In / Them'
});
const CROSSTALK_EARLIER_ECHO_WINDOW_MS = 15000;
const CROSSTALK_LATE_ECHO_WINDOW_MS = 8000;
const CROSSTALK_SHORT_ECHO_WINDOW_MS = 6000;
const CROSSTALK_SUBSTRING_MIN_WORDS = 3;
const CROSSTALK_SUBSTRING_MIN_CHARS = 14;
const CROSSTALK_MIN_SHORT_FRAGMENT_CHARS = 4;
const CROSSTALK_WORD_OVERLAP_MAX_WORDS = 8;
const CROSSTALK_WORD_OVERLAP_MIN_RATIO = 0.72;
const SAME_DIRECTION_DUPLICATE_WINDOW_MS = 1_000;
const SAME_LANGUAGE_TRANSLATION_HINT = 'Translation is ON, but source and target languages are the same. Change language in Settings.';
const TRANSLATION_OFF_HINT = 'Translation OFF: original speech only';
const TRANSLATION_ON_HINT = 'Translation ON: translated text is shown';
const TRANSCRIPT_HIDDEN_ON_HINT = 'Transcript hidden: AI Assistant still receives context';
const TRANSCRIPT_HIDDEN_OFF_HINT = 'Show transcript bubbles';
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 96;
const KEYTERM_QUERY_PREFIX = '&keyterm=';
const MAX_KEYTERM_QUERY_CHARS = 2500;
const PIPELINE_RESTART_STOP_POLL_LIMIT = 20;
const PIPELINE_RESTART_STOP_POLL_DELAY_MS = 120;
const PIPELINE_RESTART_START_SETTLE_MS = 400;
const AI_SUGGESTION_DEBOUNCE_MS = 900;
const AI_SUGGESTION_RETRY_DELAY_MS = 600;
const AI_QUICK_REQUEST_TIMEOUT_MS = 15000;
const AI_DETAIL_REQUEST_TIMEOUT_MS = 30000;
const AI_REQUEST_TIMEOUT_MESSAGE = 'AI request timed out';
const AI_COOLDOWN_STATUS = 'cooldown';
const AI_UNAVAILABLE_STATUS = 'unavailable';
const AI_ONLY_EMPTY_STATUS = 'AI Assistant has no grounded answer yet. Capture continues.';
const AI_QUICK_PROVIDER = 'groq';
const AI_DETAIL_PROVIDER = 'codex';
const AUDIO_DEVICE_WATCH_INTERVAL_MS = 30000;
const ENGINE_STOP_GRACE_MS = 8000;
const DEEPGRAM_KEYTERMS = Object.freeze([
  'Kubernetes',
  'kubectl',
  'Docker',
  'DevOps',
  'SecOps',
  'DevSecOps',
  'K2',
  'PC/SC',
  'PC/SC reader',
  'card reader',
  'smart card',
  'OWASP',
  'OWASP Top 10',
  'XSS',
  'CSRF',
  'SSRF',
  'RCE',
  'CVE',
  'CVSS',
  'JWT',
  'OAuth',
  'mTLS',
  'TLS',
  'Base64',
  'B64',
  'X.509',
  'certificate',
  'cert',
  'certificate chain',
  'public key',
  'private key',
  'WAF',
  'SAST',
  'DAST',
  'SCA',
  'SBOM',
  'Software Bill of Materials',
  'IDOR',
  'Burp Suite',
  'Burp Suite Professional',
  'OWASP ZAP',
  'OpenVAS',
  'Nuclei',
  'Semgrep',
  'DefectDojo',
  'Trivy',
  'Wazuh',
  'SOC analyst',
  'runbook',
  'bastion',
  'IAM',
  'IAM policies',
  'cluster-admin',
  'node exporter',
  'Grafana',
  'Loki',
  'Vault',
  'HashiCorp Vault',
  'threat modeling',
  'secrets scanning',
  'tcpdump',
  'traceroute',
  'Terraform',
  'GitLab',
  'GitLab Runner',
  'CI/CD',
  'Harbor',
  'Nexus',
  'Jira',
  'Google Cybersecurity',
  'Keycloak',
  'SonarQube',
  'Sonar',
  'Semgrep',
  'OIDC',
  'YubiKey',
  'CryptoPro',
  'CryptoPro CSP',
  'CryptoPro plugin',
  'CSP',
  'SSH',
  'SSH keys',
  'GOST',
  'TOTP',
  'HSM',
  'Rutoken',
  'Google Authenticator',
  'Policy Gateway',
  'policy-server',
  'policy server',
  'Treasure API',
  'Astra Linux',
  'Astra',
  'USB socket',
  'socket',
  'sudo',
  'root',
  'Firecracker',
  'node group',
  'Prometheus',
  'registry',
  'egress',
  'feature toggle',
  'FeatureToggle',
  'TDX',
  'VM',
  'init',
  'polling',
  'downtime',
  'Kafka',
  'Selectel',
  'Global Router',
  'Control Plane',
  'Zero Trust',
  'Active Directory',
  'Microsoft AD',
  'VPN',
  'VLAN',
  'VRF',
  'BGP',
  'OSPF',
  'NAT',
  'DMZ',
  'NGFW',
  'IDS',
  'IPS',
  'NAC',
  'NTA',
  'SOC',
  'L2',
  'L3',
  'L7',
  'fuzzing',
  'SDLC',
  'Dockerfile',
  'namespace',
  'cgroups',
  'kubectl exec',
  'nodeSelector',
  'pod anti-affinity'
]);
const APPSEC_TERM_REPLACEMENTS = Object.freeze([
  [/\bтандж(?:и|ем|ему|а|ей)?\b/giu, 'Tangem'],
  [/(\b(?:что\s+такое|объясни|расскажи\s+(?:про|о)|зачем\s+нужен|чем\s+отличается)\s+)даст\b/giu, '$1DAST'],
  [/(\b(?:что\s+такое|объясни|расскажи\s+(?:про|о)|зачем\s+нужен|чем\s+отличается)\s+)саст\b/giu, '$1SAST'],
  [/(\b(?:что\s+такое|объясни|расскажи\s+(?:про|о)|зачем\s+нужен|чем\s+отличается)\s+)ска\b/giu, '$1SCA'],
  [/\bSecurity\s+assistant\s+of\s+crypto\s+wallet\s+back\s+end\s+IP\s+before\s+a\s+major\s+release\b/gi, 'Security assessment of crypto wallet backend and API before a major release'],
  [/\bWhat\s+a\s+p\s+vulnerabilities\s+will\s+prioritize\s+when\s+testing\s+and\s+on\s+custodian\s+crypto\s+wallet\s+application\s+and\s+why\b/gi, 'What API vulnerabilities would you prioritize when testing a non-custodial crypto wallet application and why'],
  [/\bCan\s+you\s+describe\s+a\s+real\s+vulnerability\s+you\s+found\s+in\s+web\s+application,\s+opaque,\s+how\s+web\s+impact\s+and\s+how\s+you\s+help\s+me\s+to\s+fix\s+it\b/gi, 'Can you describe a real vulnerability you found in a web application or API, how you proved impact, and how you helped to fix it'],
  [/\bHow\s+well\s+do\s+you\s+validate\s+Wizard\s+and\s+Bug\s+bounty\s+report\s+is\s+actually\s+exploitable\s+or\s+just\s+your\s+or\s+just\s+theoretical\b/gi, 'How would you validate whether a bug bounty report is actually exploitable or just theoretical'],
  [/\bHow\s+old\s+do\s+you\s+build\s+a\s+security\s+test\s+strategy\s+for\s+web\s+application\s+by\s+Cantera's\s+and\s+strategy\s+for\s+web\s+application\s+by\s+can\s+service\s+and\s+API\s+across\s+pre\s+release\s+and\s+post\s+release\s+stage\b/gi, 'How would you build a security testing strategy for web application, backend services, and APIs across pre-release and post-release stages'],
  [/\bWatch\s+security\s+risks\s+remain\s+on\s+the\s+backend\s+side\s+if\s+you\s+wallet\s+itself\s+is\s+not\s+custodian\b/gi, 'What security risks remain on the backend side if the wallet itself is non-custodial'],
  [/\bHow\s+do\s+you\s+decide\s+whether\s+a\s+bad\s+boundary\s+report\s+is\s+critical\s+heights,\s+medium\s+low\s+severity\b/gi, 'How do you decide whether a bug bounty report is critical, high, medium, or low severity'],
  [/\bIn\s+this\s+to\s+gauge\s+whether\s+I\s+love\s+rule,\s+he\s+is\s+blocking\s+leg\s+team\s+users\s+or\s+only\s+malicious\s+traffic\b/gi, 'How would you gauge whether a WAF rule is blocking legitimate users or only malicious traffic'],
  [/\bHow\s+old\s+do\s+you\s+build\s+security\s+code\s+and\s+training\s+for\s+back\s+end\s+developers\s+who\s+work\s+with\s+Abyss\b/gi, 'How would you build secure coding training for backend developers who work with APIs'],
  [/\bTo\s+integrate\s+SAS\s+into\s+a\s+CS\s+and\s+you\s+without\s+blocking\s+every\s+match\.\s*Request\b/gi, 'How would you integrate SAST into CI/CD without blocking every merge request'],
  [/\bHow\s+old\s+do\s+you\s+tune\s+in\s+above\s+her\s+rule\s+that\s+Melox\s+and\s+mobile\s+IP\s+traffic\b/gi, 'How would you tune a WAF rule that blocks legitimate mobile API traffic'],
  [/\bHow\s+do\s+you\s+taste\s+my\s+mobile\s+IP\s+traffic\s+for\s+after\s+two\s+authorization\s+and\s+for\s+And\s+follow\s+flows\b/gi, 'How do you test deep links and universal links for account takeover risks'],
  [/\bWhy\s+wall\s+three\s+tests\s+were\s+there\s+an\s+API\s+endpoint\?\s*Clicks\s+sensitive\s+wallet\s+metadata\s+throughout\s+a\s+xsife\.expo\s+exp\s+exp\s+exp\b/gi, 'What would you test when an API endpoint leaks sensitive wallet metadata through XSS exposure'],
  [/\bI\s+will\s+suit\s+this\s+weather\s+cause\s+an\s+exploitable\s+riser\s+that\s+just\s+misconfigurate\b/gi, 'How would you decide whether this is an exploitable risk or just a misconfiguration'],
  [/\bOh,\s*hold\s+to\s+your\s+comfy\s+clothes\.\s*Api\s+shield\.\s*She's\s+having\s+validation\.\s*And\s+what\s+traffic\s+vault\s+you\s+put\s+into\s+lock\s+mode\s+before\s+unlocking\b/gi, 'How would you configure Cloudflare API Shield schema validation, and what traffic would you put into log mode before blocking'],
  [/\bhold\s+to\s+your\s+comfy\s+clothes\b/gi, 'configure Cloudflare'],
  [/\bApi\s+shield\b/gi, 'API Shield'],
  [/\bShe's\s+having\s+validation\b/gi, 'schema validation'],
  [/\btraffic\s+vault\b/gi, 'traffic would'],
  [/\block\s+mode\b/gi, 'log mode'],
  [/\bbefore\s+unlocking\b/gi, 'before blocking'],
  [/\bI\s+love\s+rule\b/gi, 'WAF rule'],
  [/\bleg\s+team\s+users\b/gi, 'legitimate users'],
  [/\bsecurity\s+code\s+and\s+training\b/gi, 'secure coding training'],
  [/\bback\s+end\s+developers\b/gi, 'backend developers'],
  [/\bwork\s+with\s+Abyss\b/gi, 'work with APIs'],
  [/\bClicks\s+sensitive\s+wallet\s+metadata\b/gi, 'leaks sensitive wallet metadata'],
  [/\bxsife\.expo\s+exp\s+exp\s+exp\b/gi, 'XSS exposure'],
  [/\bexploitable\s+riser\b/gi, 'exploitable risk'],
  [/\bmisconfigurate\b/gi, 'misconfiguration'],
  [/\bsecurity\s+assistance\s+Crypto\s+World\s+Impacment\s+up\s+before\s+a\s+major\s+race\b/gi, 'security assurance of crypto wallet implementation before a major release'],
  [/\bCrypto\s+World\s+Impacment\b/gi, 'crypto wallet implementation'],
  [/\bmajor\s+race\b/gi, 'major release'],
  [/\ball\s+shared\s+priorities\s+I\s+desires\b/gi, 'would you prioritize'],
  [/\bnon\s+custodial\s+crypto\?\s*Wallet\s+application\b/gi, 'non-custodial crypto wallet application'],
  [/\bHow\s+old\s+are\s+you\s+to\s+sew\s+to\s+creation\s+authorization\s+logic\b/gi, 'How would you secure authorization logic'],
  [/\bVapor\s+in\s+web\s+application\s+or\s+IP\b/gi, 'a web application or API'],
  [/\bHow\s+wolf\s+do\s+you\s+validate\s+where\s+embark\s+bounty\s+reports\b/gi, 'How would you validate whether bug bounty reports'],
  [/\bactually\s+exploit\s+exploitable\b/gi, 'actually exploitable'],
  [/\bHow\s+old\s+do\s+you\s+tune\s+cloud\s+photo\s+of\s+of\s+IP\s+shield\s+Aurelius\b/gi, 'How would you tune Cloudflare or IP shield rules'],
  [/\blegume\s+users\b/gi, 'legitimate users'],
  [/\bbusiness\s+log\s+for\s+vulnerabilities\s+that\s+Aftermath\s+scanner\s+usually\s+miss\b/gi, 'business logic vulnerabilities that automated scanners usually miss'],
  [/\bapplication\s+security\s+check\s+and\s+c\s*s\s*c\s*d\s+pipeline\b/gi, 'application security checks into a CI/CD pipeline'],
  [/\bSAS\s+into\s+a\s+CS\s+and\s+you\b/gi, 'SAST into CI/CD'],
  [/\bblocking\s+every\s+match\.\s*Request\b/gi, 'blocking every merge request'],
  [/\babove\s+her\s+rule\b/gi, 'WAF rule'],
  [/\bMelox\s+and\s+mobile\s+IP\s+traffic\b/gi, 'blocks legitimate mobile API traffic'],
  [/\btaste\s+my\s+mobile\s+IP\s+traffic\b/gi, 'test deep links and universal links'],
  [/\bafter\s+two\s+authorization\s+and\s+for\s+And\s+follow\s+flows\b/gi, 'account takeover risks'],
  [/\bslowing\s+down\s+the\s+wall\s+press\b/gi, 'slowing down the workflow'],
  [/\bAppian\s+point\s+click\s+sensitive\s+OLED\s+relative\s+metadata\b/gi, 'API endpoint leaks sensitive object-level metadata'],
  [/\bhow\s+well\s+do\s+you\s+assess\?\s*Severity\s+and\s+communication\s+the\s+risk\s+to\s+in\s+generic\b/gi, 'how would you assess severity and communicate the risk to engineering'],
  [/\bHow\s+old\s+do\s+you\s+build\s+a\s+security\s+test\s+to\s+stretch\s+any\s+four\s+web\s+application\s+back\s+in\s+service\s+and\s+API\b/gi, 'How would you build a security testing strategy for web application, backend services, and APIs'],
  [/\bacross\s+the\s+across\s+pre\s+release\s+and\s+post\s+release\s+stage\b/gi, 'across pre-release and post-release stages'],
  [/\bSoftware\s+бил(?:\s+в)?\s+materials\b/gi, 'Software Bill of Materials'],
  [/\bSoftware\s+build\s+materials\b/gi, 'Software Bill of Materials'],
  [/\bWASP\s+TOP\s+TEN\b/gi, 'OWASP Top 10'],
  [/\bWASP\s+TOP\s+10\b/gi, 'OWASP Top 10'],
  [/\bWASP\s+TOP\b/gi, 'OWASP Top'],
  [/\bOWASP\s+TOP\s+TEN\b/gi, 'OWASP Top 10'],
  [/\bOWASP\s+TOP\s+10\b/gi, 'OWASP Top 10'],
  [/\bOWASP\s+TOP\b/gi, 'OWASP Top'],
  [/васп\s+топ\s+тен/giu, 'OWASP Top 10'],
  [/васп\s+топ\s+10/giu, 'OWASP Top 10'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])с\s*бом(?:ов|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1SBOM'],
  [/\bSasta\b/gi, 'SAST'],
  [/саста/giu, 'SAST'],
  [/\bDasta\b/gi, 'DAST'],
  [/даста/giu, 'DAST'],
  [/\bd\s*DevOps\b/gi, 'DevOps'],
  [/\bdelops\b/gi, 'DevOps'],
  [/\bdevelops\b/gi, 'DevOps'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])дивопс(?:а|у|ом|е|ы|ов)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1DevOps'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])диопс(?:а|у|ом|е|ы|ов)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1DevOps'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])девопс(?:а|у|ом|е|ы|ов)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1DevOps'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])удивовц(?:а|у|ом|е|ы|ов)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1DevOps'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])ватсве\s+девопсы(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1DevOps'],
  [/\bватсве\s+DevOps\b/giu, 'DevOps'],
  [/\bm\s+tls\b/gi, 'mTLS'],
  [/\bMTLS\b/g, 'mTLS'],
  [/\bmtls\b/g, 'mTLS'],
  [/\bTCP\s+Dumb\b/gi, 'tcpdump'],
  [/\btcp\s+dumb\b/gi, 'tcpdump'],
  [/\bTcp-дам\b/gi, 'tcpdump'],
  [/\btcp-дам\b/gi, 'tcpdump'],
  [/тсп-дам/giu, 'tcpdump'],
  [/\bBISC\s*-?\s*64\b/gi, 'Base64'],
  [/\bBIC\s*-?\s*64\b/gi, 'Base64'],
  [/\bBIS\s*-?\s*64\b/gi, 'Base64'],
  [/\bB\s*64\b/gi, 'B64'],
  [/бейс(?:ик)?\s*-?\s*64/giu, 'Base64'],
  [/би\s*си\s*-?\s*64/giu, 'Base64'],
  [/\bSertu\b/gi, 'cert'],
  [/серту/giu, 'cert'],
  [/\btrife\s+roads\b/gi, 'traceroute'],
  [/\btrife\s+route\b/gi, 'traceroute'],
  [/\btrace\s+route\b/gi, 'traceroute'],
  [/\bGET\s*Lab\b/gi, 'GitLab'],
  [/\bGETLab\b/gi, 'GitLab'],
  [/\bGetLab\b/g, 'GitLab'],
  [/\bGitlab\b/g, 'GitLab'],
  [/\bgetlab\b/g, 'GitLab'],
  [/\bgetlub\b/gi, 'GitLab'],
  [/\bdeclub\b/gi, 'GitLab'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])г[еи]т\s*лаб(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1GitLab'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])г[еи]тлаб(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1GitLab'],
  [/\bArvor\b/gi, 'Harbor'],
  [/\bHarva\b/gi, 'Harbor'],
  [/\bHarbot\b/gi, 'Harbor'],
  [/\btirebor\b/gi, 'Harbor'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])харбор(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Harbor'],
  [/\bNetsus\b/gi, 'Nexus'],
  [/\bExas\b/gi, 'Nexus'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])нексус(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Nexus'],
  [/\bVolta\b/gi, 'Vault'],
  [/\bValta\b/gi, 'Vault'],
  [/\bWalt\b/g, 'Vault'],
  [/\bwalt\b/g, 'Vault'],
  [/\bLotWorld\b/gi, 'Vault'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])волт(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Vault'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])конфлюенс(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Confluence'],
  [/\bTeam\s+City\b/gi, 'TeamCity'],
  [/\bTwe\s+City\b/gi, 'TeamCity'],
  [/\bteamcity\b/gi, 'TeamCity'],
  [/\bnot\s+group\b/gi, 'node group'],
  [/\bnode\s*group\b/gi, 'node group'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])н[оа]д[-\s]?групп(?:а|е|у|ой|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1node group'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])нот[-\s]?групп(?:а|е|у|ой|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1node group'],
  [/\bCI\s*CD\b/gi, 'CI/CD'],
  [/\bCICD\b/gi, 'CI/CD'],
  [/\bICD\b/gi, 'CI/CD'],
  [/си\s*ай\s*си\s*ди/giu, 'CI/CD'],
  [/\bJaba\b/g, 'job'],
  [/\bJoba\b/g, 'job'],
  [/\bboost\b/gi, 'Burp Suite'],
  [/\bburg\s+suite(?:\s+professional)?\b/gi, 'Burp Suite Professional'],
  [/\bburp\s+suite\s+professional\b/gi, 'Burp Suite Professional'],
  [/\bburp\s+suite\b/gi, 'Burp Suite'],
  [/б[её]рп\s+сь?ют(?:а|е|ом)?/giu, 'Burp Suite'],
  [/бурп\s+сь?ют(?:а|е|ом)?/giu, 'Burp Suite'],
  [/\bо\s+вас\s+к\s+западу\b/giu, 'OWASP ZAP'],
  [/\bо\s+вас\s+зап\b/giu, 'OWASP ZAP'],
  [/овасп\s+зап/giu, 'OWASP ZAP'],
  [/начать\s+с\s+запад[а-я]*/giu, 'начать с OWASP ZAP'],
  [/\bNucai\b/gi, 'Nuclei'],
  [/\bнукай\b/giu, 'Nuclei'],
  [/\bнюклей\b/giu, 'Nuclei'],
  [/\bfirecrecards\b/gi, 'Firecracker'],
  [/\bfirecraker\b/gi, 'Firecracker'],
  [/\bfirecracker\b/gi, 'Firecracker'],
  [/\bSingrep\b/gi, 'Semgrep'],
  [/\bSimGreb\b/gi, 'Semgrep'],
  [/\bsing\s+gr[ae]p\b/gi, 'Semgrep'],
  [/\bsing\s+reb\b/gi, 'Semgrep'],
  [/\basting\s+gr[ae]p\b/gi, 'Semgrep'],
  [/сем\s*греп/giu, 'Semgrep'],
  [/семгреп/giu, 'Semgrep'],
  [/\beTrivy\b/gi, 'Trivy'],
  [/\bSONAR\b/g, 'SonarQube'],
  [/\bSonar\b/g, 'SonarQube'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])сонар(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1SonarQube'],
  [/\bkicklog\b/gi, 'Keycloak'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])киклак(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Keycloak'],
  [/\bjiva\b/gi, 'Jira'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])джир(?:а|е|у|ой|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Jira'],
  [/\bGoogle\s+Server\s+Secutive\b/gi, 'Google Cybersecurity'],
  [/\bGoogle\s+Cyber\s+Security\b/gi, 'Google Cybersecurity'],
  [/\bkey\s*clock\b/gi, 'Keycloak'],
  [/\bkeyclock\b/gi, 'Keycloak'],
  [/\bkeklock\b/gi, 'Keycloak'],
  [/киклок/giu, 'Keycloak'],
  [/кеклок/giu, 'Keycloak'],
  [/\bOEDC\b/gi, 'OIDC'],
  [/\bOADC\b/gi, 'OIDC'],
  [/\bo\s*-?\s*adc\b/gi, 'OIDC'],
  [/\bPDX\b/gi, 'TDX'],
  [/\bFDX\b/gi, 'TDX'],
  [/\bTDM\b/gi, 'TDX'],
  [/\bQD\s*2\b/gi, 'K2'],
  [/\bK\s*2\b/gi, 'K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])ик\s*-?\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])и\s+к\s*-?\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])ка\s*-?\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])к\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])мк\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])ек\s*2(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1K2'],
  [/\bканал\s+K2\b/gi, 'канал K2'],
  [/\bканал\s+к\s*2\b/giu, 'канал K2'],
  [/канал\s+ик\s*-?\s*2/giu, 'канал K2'],
  [/канал\s+ка\s*-?\s*2/giu, 'канал K2'],
  [/\bhsam\b/gi, 'HSM'],
  [/\bASSAH\b/gi, 'SSH'],
  [/\bSSAH\b/gi, 'SSH'],
  [/\bTvm\b/g, 'VM'],
  [/\bNIT\b/g, 'init'],
  [/\bmini\s+polying\b/gi, 'mini polling'],
  [/\bpolying\b/gi, 'polling'],
  [/\bdimetime\b/gi, 'downtime'],
  [/\bdone\s+time\b/gi, 'downtime'],
  [/\bPCC\s+ридер\b/giu, 'PC/SC reader'],
  [/\bUSB\s+PCC\s+ридер\b/giu, 'USB PC/SC reader'],
  [/\bPCC\b/g, 'PC/SC'],
  [/\bControl\s+plan\b/gi, 'Control Plane'],
  [/\bControl\s+play\b/gi, 'Control Plane'],
  [/\bControl\s+pling\b/gi, 'Control Plane'],
  [/\bGlobal\s+Road\b/gi, 'Global Router'],
  [/\bSelectTale\b/gi, 'Selectel'],
  [/\bSelect\s+tell\b/gi, 'Selectel'],
  [/\bSliktelry\b/gi, 'Selectel'],
  [/\bselect\s+tell\b/gi, 'Selectel'],
  [/\bselectel\b/gi, 'Selectel'],
  [/селектейл/giu, 'Selectel'],
  [/селектел(?:л|лу|ла|ом|е)?/giu, 'Selectel'],
  [/\bUBK\b/gi, 'YubiKey'],
  [/\bYBK\b/gi, 'YubiKey'],
  [/юби\s*кей/giu, 'YubiKey'],
  [/юбикей/giu, 'YubiKey'],
  [/\bClibreprood\s+tools\b/gi, 'CryptoPro tools'],
  [/\bCrypto\s*Prood?\s+tools\b/gi, 'CryptoPro tools'],
  [/\bCrypto\s*Pro\b/gi, 'CryptoPro'],
  [/\bCryptu\s*Pro\b/gi, 'CryptoPro'],
  [/\bCryptuPro\b/gi, 'CryptoPro'],
  [/\bCryptoProp\b/gi, 'CryptoPro'],
  [/\bCrypto\s+Prop\b/gi, 'CryptoPro'],
  [/\bCliptoPro\b/gi, 'CryptoPro'],
  [/\bCrypto\s+Pro\b/gi, 'CryptoPro'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])скрипт(?:а|у|ом|е)?\s+про(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1CryptoPro'],
  [/крипто\s*про/giu, 'CryptoPro'],
  [/\bC(?:op|rop)ois\b/gi, 'CryptoPro CSP'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])ксп(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1CSP'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])цсп(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1CSP'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])сиспи(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1CSP'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])хсма?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1HSM'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])хэсэм(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1HSM'],
  [/\brootoken\b/gi, 'Rutoken'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])рутокен(?:а|у|ом|е|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Rutoken'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])рутокел(?:а|у|ом|е|ы)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Rutoken'],
  [/\bTreshare\s+IP\b/gi, 'Treasure API'],
  [/\bTreshare\s+API\b/gi, 'Treasure API'],
  [/\bTreasure\s+IP\b/gi, 'Treasure API'],
  [/\bCafку\b/giu, 'Kafka'],
  [/кафку/giu, 'Kafka'],
  [/кавк(?:а|е|у|ой|и)/giu, 'Kafka'],
  [/кафк(?:а|е|у|ой|и)/giu, 'Kafka'],
  [/\bSSSH\b/gi, 'SSH'],
  [/саша\s+ключ(?:и)?/giu, 'SSH ключи'],
  [/\bAttP-?код\b/gi, 'TOTP-код'],
  [/\bAuse\s+Provider\b/gi, 'Auth Provider'],
  [/\bGROPAN\b/gi, 'Grafana'],
  [/\bLocky\b/gi, 'Loki'],
  [/\blockey\b/gi, 'Loki'],
  [/полиси\s+gateway/giu, 'Policy Gateway'],
  [/\bpolicy\s+server\b/gi, 'policy-server'],
  [/полиси[-\s]+сервер(?:а|у|ом|е)?/giu, 'policy-server'],
  [/сервер\s+полисе/giu, 'policy-server'],
  [/монадатные\s+политики/giu, 'мандатные политики'],
  [/политики\s+астеры/giu, 'политики Astra'],
  [/мандатные\s+политики\s+астра/giu, 'мандатные политики Astra'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])астр(?:а|ы|е|ой)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1Astra'],
  [/\bSOKET\b/g, 'socket'],
  [/\bUSB[-\s]+сокет(?:а|у|ом|е)?\b/giu, 'USB socket'],
  [/юсб[-\s]+сокет(?:а|у|ом|е)?/giu, 'USB socket'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])сокет(?:а|у|ом|е)?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1socket'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])сс?удо(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1sudo'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])судов(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1sudo'],
  [/права\s+рута/giu, 'права root'],
  [/(^|[^A-Za-zА-Яа-яЁё0-9_])рутом?(?=$|[^A-Za-zА-Яа-яЁё0-9_])/giu, '$1root'],
  [/\bEGRS\b/g, 'egress'],
  [/\bRegistery\b/gi, 'registry'],
  [/\bpro\s+Metal(?:s)?\b/gi, 'Prometheus'],
  [/\bGRAFAN\b/g, 'Grafana'],
  [/\bFeature\s*Toggle\b/gi, 'FeatureToggle'],
  [/\bfitch\b/gi, 'feature'],
  [/фич[еи]стог(?:а|у|ой|е|и)?/giu, 'feature toggle'],
  [/\btdx\b/g, 'TDX'],
  [/check[-\s]+сумм(?:а|у|ой|е|ы)?/giu, 'checksum'],
  [/чек[-\s]+сумм(?:а|у|ой|е|ы)?/giu, 'checksum'],
  [/оптулокн(?:о|а|у|ом|е)?/giu, 'оптоволокно'],
  [/автоволокн(?:о|а|у|ом|е)?/giu, 'оптоволокно'],
  [/\bgost\b/gi, 'GOST'],
  [/\bjson\b/g, 'JSON'],
  [/\bphysing\b/gi, 'fuzzing'],
  [/физинг/giu, 'fuzzing'],
  [/фазинг/giu, 'fuzzing'],
  [/\bSDLS\b/gi, 'SDLC'],
  [/сдлс/giu, 'SDLC'],
  [/\bevopsing\b/gi, 'DevOps'],
  [/\bevops\b/gi, 'DevOps'],
  [/\bsecups\b/gi, 'SecOps'],
  [/\bsecDojo\b/g, 'SecOps'],
  [/\bdefsy\s+cops\b/gi, 'DevSecOps'],
  [/\bdev\s+sec\s+ops\b/gi, 'DevSecOps'],
  [/АВС(?:е|а)?/giu, 'AWS'],
  [/\bABS\b/g, 'AWS'],
  [/\bAccessS\b/gi, 'XSS'],
  [/эксессесс/giu, 'XSS'],
  [/\bwav\b/gi, 'WAF'],
  [/\bCors\b/gi, 'CORS'],
  [/\bJavaTi\s+токен\b/gi, 'JWT токен'],
  [/\bTownScript\b/gi, 'TypeScript'],
  [/нот\s+на\s+до/giu, 'Node.js'],
  [/нот\s+знаком/giu, 'Node знаком'],
  [/с\s+нодой\s+как/giu, 'с Node.js как'],
  [/на\s+ноде\s+всё\s+написано/giu, 'на Node.js всё написано'],
  [/\bSAG\s+ключи\b/giu, 'SSH ключи'],
  [/саг\s+ключи/giu, 'SSH ключи'],
  [/\bProdeConder\b/gi, 'prod contour'],
  [/\bProdeConture\b/gi, 'prod contour'],
  [/без\s+практис/giu, 'best practices'],
  [/hyper\s+liquid/giu, 'Hyperliquid'],
  [/aster\s+liter/giu, 'Aster'],
  [/\bdrivy\b/gi, 'Trivy'],
  [/\bTriV\b/g, 'Trivy'],
  [/3\s+виллы/giu, 'Trivy'],
  [/триви/giu, 'Trivy'],
  [/три\s*ви/giu, 'Trivy'],
  [/\bdefect\s+dother\b/gi, 'DefectDojo'],
  [/\bdefect\s+dog\b/gi, 'DefectDojo'],
  [/\beffect\s+dog\b/gi, 'DefectDojo'],
  [/\bdefect\s+dojo\b/gi, 'DefectDojo'],
  [/дефект\s+доджо/giu, 'DefectDojo'],
  [/\bдо\s+даст\b/giu, 'до DAST'],
  [/\bдальше\s+уже\s+Dust\b/giu, 'дальше уже DAST'],
  [/\bсначала\s+сделать\s+3(?=,\s+потом\s+сделать\s+DefectDojo)/giu, 'сначала сделать Trivy'],
  [/\bвозух\b/giu, 'Wazuh'],
  [/\bс\s+воздухом\b/giu, 'с Wazuh'],
  [/\bс\s+воздуха\b/giu, 'с Wazuh'],
  [/\bчерез\s+воздух\b/giu, 'через Wazuh'],
  [/\bвазу\b/giu, 'Wazuh'],
  [/\bPassecurity\b/gi, 'AppSec security'],
  [/сока\s+налиток/giu, 'SOC analyst'],
  [/сок\s+аналитик/giu, 'SOC analyst'],
  [/рандбук(?:а|и|ов|ом)?/giu, 'runbook'],
  [/ранбук(?:а|и|ов|ом)?/giu, 'runbook'],
  [/\bнод\s+э?CSPортер\b/giu, 'node exporter'],
  [/\bnode\s+э?CSPортер\b/giu, 'node exporter'],
  [/\beam\s+politik\b/gi, 'IAM policies'],
  [/ай\s*эм\s+политик(?:и)?/giu, 'IAM policies'],
  [/\bcluster\s+admin\b/gi, 'cluster-admin'],
  [/кластер\s+админ/giu, 'cluster-admin'],
  [/\bforwall\b/gi, 'firewall'],
  [/\bstagejet\b/gi, 'stage'],
  [/\bstatejet\b/gi, 'stage'],
  [/\bCustomed\b/gi, 'Custodian'],
  [/\bCustodians\b/gi, 'Custodian'],
  [/\bOpport\s+GraphQL\b/gi, 'GraphQL'],
  [/\bICYNITWALL\b/gi, 'HashiCorp Vault'],
  [/\bGit\s+Postgreat\s+Postgreat\s+Patched\s+Elete\b/gi, 'GET, POST, PUT, PATCH, DELETE'],
  [/\bGit\s+Postgreat\s+Postgreat\s+Patched\s+Delete\b/gi, 'GET, POST, PUT, PATCH, DELETE'],
  [/\bGit\s+Postgreat\s+Patched\s+Elete\b/gi, 'GET, POST, PATCH, DELETE'],
  [/\bметоде\s+Git\b/giu, 'методе GET'],
  [/\bу\s+Git\b/giu, 'у GET'],
  [/\bв\s+Git\b/giu, 'в GET'],
  [/\bGit\s+это\b/giu, 'GET это'],
  [/\bGit\s+есть\s+body\b/giu, 'GET есть body'],
  [/гетто\s+и\s+поста/giu, 'GET и POST'],
  [/\bPostgreat\b/gi, 'POST'],
  [/\bPatched\s+Elete\b/gi, 'PATCH, DELETE'],
  [/\bPatched\s+Delete\b/gi, 'PATCH, DELETE'],
  [/\bElete\b/g, 'DELETE'],
  [/\bforized\.?\s+Keys\b/gi, 'authorized_keys'],
  [/\bauthorized\.\s+Keys\b/gi, 'authorized_keys'],
  [/\bBinSH\b/g, '/bin/sh'],
  [/\bBASP\b/g, 'bash'],
  [/\bCWE\s+TLS\b/gi, 'kubectl exec']
]);

let stats = { stt: [], trl: [], tts: [], lat: [], count: 0 };
let muteState = { outgoing: false, incoming: false };
let pending = { direction: null, transcript: null, translation: null };
let lastRenderedDirection = null;
let lastMsgEl = null;
let lastMsgTime = 0;
let lastRenderedMessage = null;
let recentRenderedMessages = [];
let sessionStart = Date.now();
let bookmarkFilterOn = false;
let textOnlyMode = false;
let transcriptOnlyMode = false;
let transcriptHiddenMode = false;
let allMessages = [];
let currentSettings = {};
let availableAudioInputs = [];
let availableAudioOutputs = [];
let browserVoices = [];
let browserVoicesReady = false;
let browserTtsSpeaking = false;
let browserTtsQueue = Promise.resolve();
let edgeVoicesByLang = {};
let edgeVoicesLoading = {};
let aiSuggestionsOpen = false;
let aiSuggestionsBusy = false;
let aiSuggestionTimer = null;
let lastSuggestionFingerprint = '';
let assistantMsgEl = null;
let assistantEntriesEl = null;
let activeAssistantEntry = null;
let aiSuggestionsQueued = false;
let aiSuggestionRequestSeq = 0;
let latestAssistantAnswer = '';
let assistantMemory = loadAssistantMemory();
let assistantMemoryRendered = false;
let activeCallId = null;
let resumedCallId = null;
let resumedCallLoaded = false;
let resumeAutoStart = false;
let bootReady = false;
let engineReady = false;
let activePromptKind = '';
let audioDeviceWatchTimer = null;
let audioHotplugBusy = false;
let audioDeviceSignature = '';

// ===== API key masking (no password detection) =====
document.querySelectorAll('.sp-key').forEach(input => {
  let realValue = input.value;
  const mask = (v) => v.length > 4 ? '••••••••' + v.slice(-4) : v;

  input.addEventListener('focus', () => { input.value = realValue; });
  input.addEventListener('blur', () => { realValue = input.value; input.value = mask(realValue); });
  input.addEventListener('input', () => { realValue = input.value; });

  // Expose real value getter for readForm/populateForm
  input._getRealValue = () => realValue;
  input._setRealValue = (v) => { realValue = v; input.value = mask(v); };
});

// ===== Theme =====
function getTheme() { return localStorage.getItem('translator-theme') || 'dark'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-btn').textContent = t === 'dark' ? '\u2600' : '\u263E';
}
function toggleTheme() {
  const t = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('translator-theme', t);
  applyTheme(t);
}
applyTheme(getTheme());

// ===== Timer =====
function updateTimer() {
  if (timerPaused) return;
  const elapsed = Date.now() - sessionStart - timerOffset;
  const s = Math.max(0, Math.floor(elapsed / 1000));
  const m = Math.floor(s / 60);
  document.getElementById('timer').textContent = m + ':' + String(s % 60).padStart(2, '0');
}
setInterval(updateTimer, 1000);

// ===== Toast =====
let toastTimeout = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

// ===== Copy =====
function copyBubble(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
}

// ===== AI Prompt Context =====
function promptConfig(kind) {
  return AI_PROMPT_CONTEXTS[kind] || null;
}

function normalizePromptText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u0000/g, '').trim();
}

function clipPromptText(text) {
  const value = normalizePromptText(text);
  if (value.length <= AI_PROMPT_MAX_CHARS) return value;
  const keep = Math.max(0, AI_PROMPT_MAX_CHARS - AI_PROMPT_TRUNCATION_MARKER.length);
  return value.slice(0, keep).trimEnd() + AI_PROMPT_TRUNCATION_MARKER;
}

function promptCounterText(text) {
  return String(normalizePromptText(text).length) + '/' + String(AI_PROMPT_MAX_CHARS);
}

function updatePromptCounter() {
  const textEl = document.getElementById('prompt-text');
  const countEl = document.getElementById('prompt-count');
  if (!textEl || !countEl) return;
  countEl.textContent = promptCounterText(textEl.value);
}

function currentAiPromptContext() {
  return {
    res: clipPromptText(currentSettings.ai_resume_prompt || ''),
    vac: clipPromptText(currentSettings.ai_vacancy_prompt || '')
  };
}

function updatePromptButtons() {
  Object.keys(AI_PROMPT_CONTEXTS).forEach(kind => {
    const cfg = promptConfig(kind);
    const btn = cfg ? document.getElementById(cfg.buttonId) : null;
    if (!cfg || !btn) return;
    const loaded = Boolean(clipPromptText(currentSettings[cfg.settingsKey] || ''));
    btn.classList.toggle('loaded', loaded);
    btn.setAttribute('aria-pressed', loaded ? 'true' : 'false');
  });
}

function openPromptEditor(kind) {
  const cfg = promptConfig(kind);
  if (!cfg) {
    showToast('Unknown prompt');
    return;
  }
  activePromptKind = kind;
  const titleEl = document.getElementById('prompt-title');
  const textEl = document.getElementById('prompt-text');
  if (titleEl) titleEl.textContent = cfg.title;
  if (textEl) textEl.value = clipPromptText(currentSettings[cfg.settingsKey] || '');
  updatePromptCounter();
  document.getElementById('prompt-backdrop')?.classList.add('open');
  document.getElementById('prompt-panel')?.classList.add('open');
  setTimeout(() => textEl?.focus(), 0);
}

function closePromptEditor() {
  document.getElementById('prompt-backdrop')?.classList.remove('open');
  document.getElementById('prompt-panel')?.classList.remove('open');
  activePromptKind = '';
}

function triggerPromptFile() {
  const input = document.getElementById('prompt-file');
  if (!input) {
    showToast('File input unavailable');
    return;
  }
  input.click();
}

function isPromptTextFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  if (AI_PROMPT_TEXT_TYPES.has(String(file.type || ''))) return true;
  return AI_PROMPT_FILE_EXTENSIONS.some(ext => name.endsWith(ext));
}

async function readPromptFile(file) {
  if (!isPromptTextFile(file)) {
    throw new Error('Only .txt and .md files are supported');
  }
  return clipPromptText(await file.text());
}

function refreshAssistantAfterPromptChange() {
  lastSuggestionFingerprint = '';
  if (aiSuggestionsOpen && allMessages.length) void fetchAiSuggestions(true);
}

async function savePromptEditor(closeAfterSave = true) {
  const cfg = promptConfig(activePromptKind);
  const textEl = document.getElementById('prompt-text');
  if (!cfg || !textEl) {
    showToast('Prompt editor unavailable');
    return;
  }

  const text = clipPromptText(textEl.value);
  textEl.value = text;
  updatePromptCounter();
  currentSettings[cfg.settingsKey] = text;

  try {
    await saveSettings();
    updatePromptButtons();
    refreshAssistantAfterPromptChange();
    showToast(text ? cfg.title + ' saved' : cfg.title + ' cleared');
    if (closeAfterSave) closePromptEditor();
  } catch (e) {
    showToast(e.message || 'Prompt save failed');
  }
}

async function clearPromptEditor() {
  const textEl = document.getElementById('prompt-text');
  if (!textEl) {
    showToast('Prompt editor unavailable');
    return;
  }
  textEl.value = '';
  updatePromptCounter();
  await savePromptEditor(false);
}

async function loadPromptFile(event) {
  const input = event?.target || null;
  const file = input?.files?.[0] || null;
  if (!file) return;
  const textEl = document.getElementById('prompt-text');
  if (!textEl) {
    showToast('Prompt editor unavailable');
    return;
  }

  try {
    textEl.value = await readPromptFile(file);
    updatePromptCounter();
    await savePromptEditor(false);
  } catch (e) {
    showToast(e.message || 'File load failed');
  } finally {
    input.value = '';
  }
}

// ===== AI Assistant =====
function latestSuggestionMessages() {
  return allMessages.slice(-30).map(m => ({
    direction: m.direction,
    transcript: m.transcript || '',
    translation: m.translation || '',
    at: m.at || 0
  }));
}

function loadAssistantMemory() {
  try {
    const items = JSON.parse(sessionStorage.getItem(AI_MEMORY_KEY) || '[]');
    return Array.isArray(items) ? items.slice(-AI_MEMORY_MAX) : [];
  } catch (e) {
    return [];
  }
}

function saveAssistantMemory() {
  try {
    sessionStorage.setItem(AI_MEMORY_KEY, JSON.stringify(assistantMemory.slice(-AI_MEMORY_MAX)));
  } catch (e) {}
}

function loadCallAssistantStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_CALL_HISTORY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveCallAssistantStore(store) {
  try {
    localStorage.setItem(AI_CALL_HISTORY_KEY, JSON.stringify(store || {}));
  } catch (e) {}
}

function loadCallAssistantEntries(callId) {
  if (!callId) return [];
  const store = loadCallAssistantStore();
  const entries = store[String(callId)];
  return Array.isArray(entries) ? entries.slice(-AI_CALL_HISTORY_MAX) : [];
}

function persistCallAssistantAnswer(answer, provider, messages) {
  if (!activeCallId) return;
  const text = clipMemoryText(cleanAssistantAnswerText(answer), AI_CALL_ANSWER_MAX);
  if (!text) return;
  const last = messages?.[messages.length - 1] || {};
  const store = loadCallAssistantStore();
  const key = String(activeCallId);
  const entries = Array.isArray(store[key]) ? store[key] : [];
  const fingerprint = suggestionFingerprint(messages || []);
  const lastEntry = entries[entries.length - 1] || {};
  if (lastEntry.fingerprint === fingerprint && lastEntry.answer === text) return;
  entries.push({
    answer: text,
    provider: provider || '',
    source: answerSourceFromMessages(messages || []),
    side: last.direction === 'incoming' ? 'assistant-right' : 'assistant-left',
    at: Date.now(),
    fingerprint
  });
  store[key] = entries.slice(-AI_CALL_HISTORY_MAX);
  saveCallAssistantStore(store);
}

function clearAssistantMemory() {
  assistantMemory = [];
  assistantMemoryRendered = false;
  try { sessionStorage.removeItem(AI_MEMORY_KEY); } catch (e) {}
}

function clipMemoryText(text, maxLen) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1).trimEnd() + '…';
}

function latestAiMemory() {
  return assistantMemory.slice(-8).map(item => ({
    provider: item.provider || '',
    source: clipMemoryText(item.source || '', AI_MEMORY_CONTEXT_MAX),
    answer: clipMemoryText(item.answer || '', AI_MEMORY_ANSWER_MAX),
    at: item.at || 0
  }));
}

function answerSourceFromMessages(messages) {
  const last = messages[messages.length - 1] || {};
  const speaker = speakerPrefix(last.direction || 'outgoing');
  const text = last.translation || last.transcript || '';
  return clipMemoryText(speaker + ': ' + text, AI_MEMORY_CONTEXT_MAX);
}

function rememberAssistantAnswer(answer, provider, messages) {
  const text = clipMemoryText(answer, AI_MEMORY_ANSWER_MAX);
  if (!text) return;
  assistantMemory.push({
    provider: provider || '',
    source: answerSourceFromMessages(messages || []),
    answer: text,
    at: Date.now()
  });
  assistantMemory = assistantMemory.slice(-AI_MEMORY_MAX);
  saveAssistantMemory();
  persistCallAssistantAnswer(answer, provider, messages);
}

function suggestionFingerprint(messages) {
  return messages.map(m => [
    m.direction,
    normalizeMessageText(m.transcript),
    normalizeMessageText(m.translation)
  ].join(':')).join('|');
}

function providerLabel(provider) {
  const normalized = String(provider || '').trim();
  if (normalized.includes('+')) {
    return normalized
      .split('+')
      .map(part => providerLabel(part))
      .join(' + ');
  }
  if (normalized === 'codex') return 'ChatGPT / Codex';
  if (normalized === 'auto') return 'Auto';
  if (normalized === 'openrouter') return 'OpenRouter';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'groq') return 'Groq';
  if (normalized === 'groq_backup') return 'Groq backup';
  return 'LLM';
}

function combinedProvider(quickProvider, detailProvider) {
  const quick = String(quickProvider || '').trim();
  const detail = String(detailProvider || '').trim();
  if (!quick) return detail;
  if (!detail || detail === quick) return quick;
  return quick + '+' + detail;
}

function latestMessageElement() {
  return allMessages.length ? allMessages[allMessages.length - 1].el : null;
}

function insertAssistantCard(card, afterEl = null) {
  const anchor = afterEl && afterEl.parentNode === chat ? afterEl.nextSibling : typingEl;
  chat.insertBefore(card, anchor || typingEl);
}

function createAssistantCard(state) {
  const card = document.createElement('div');
  const sourceMsg = allMessages[allMessages.length - 1] || null;
  const sourceEl = latestMessageElement();
  const sideClass = sourceMsg?.direction === 'incoming' ? 'assistant-right' : 'assistant-left';
  card.className = 'assistant-msg assistant-inline ' + sideClass;
  if (sourceEl) card.dataset.sourceAt = String(sourceMsg?.at || Date.now());

  const head = document.createElement('div');
  head.className = 'assistant-head';
  const title = document.createElement('span');
  title.className = 'assistant-title';
  title.textContent = 'AI Assistant';
  const status = document.createElement('span');
  status.className = 'assistant-status';
  head.appendChild(title);
  head.appendChild(status);

  const body = document.createElement('div');
  body.className = 'assistant-body';

  card.appendChild(head);
  card.appendChild(body);
  insertAssistantCard(card, sourceEl);
  updateAssistantCard(card, '', '', state);
  return card;
}

function updateAssistantCard(card, answer, provider, state) {
  const status = card.querySelector('.assistant-status');
  const body = card.querySelector('.assistant-body');
  const answerText = cleanAssistantAnswerText(answer || '');

  card.classList.toggle('loading', state === 'loading' || state === 'partial');
  card.classList.toggle('error', state === 'error');
  card.classList.toggle('cooldown', state === AI_COOLDOWN_STATUS || state === AI_UNAVAILABLE_STATUS);
  if (state === 'loading' || state === 'partial') {
    status.textContent = 'Thinking...';
  } else if (provider) {
    status.textContent = providerLabel(provider);
  } else if (state === 'error') {
    status.textContent = 'Error';
  } else if (state === AI_COOLDOWN_STATUS || state === AI_UNAVAILABLE_STATUS) {
    status.textContent = 'Waiting';
  } else {
    status.textContent = '';
  }
  body.textContent = answerText || (state === 'loading' ? '1) Thinking...\n\n2) Waiting for the detailed answer...' : 'No answer yet');
}

function latestReusableAssistantStatusCard() {
  const cards = Array.from(chat.querySelectorAll('.assistant-msg.assistant-inline'));
  const card = cards[cards.length - 1] || null;
  if (!card) return null;
  return card.classList.contains('cooldown') || card.classList.contains('loading') ? card : null;
}

function renderAssistantAnswer(answer, provider, state) {
  const keepPinned = isChatNearBottom();
  latestAssistantAnswer = answer || '';
  if (state === 'loading') {
    activeAssistantEntry = latestReusableAssistantStatusCard() || createAssistantCard(state);
    updateAssistantCard(activeAssistantEntry, '', '', state);
  } else if (state === 'partial') {
    const card = activeAssistantEntry || createAssistantCard(state);
    updateAssistantCard(card, answer, provider, state);
  } else {
    const statusCard = state === AI_COOLDOWN_STATUS || state === AI_UNAVAILABLE_STATUS
      ? latestReusableAssistantStatusCard()
      : null;
    const card = activeAssistantEntry || statusCard || createAssistantCard(state);
    updateAssistantCard(card, answer, provider, state);
    activeAssistantEntry = null;
    trimAssistantCards();
  }
  scrollBottomIfPinned(keepPinned);
}

function discardActiveAssistantCard() {
  if (!activeAssistantEntry) return;
  activeAssistantEntry.remove();
  activeAssistantEntry = null;
}

function renderStoredAssistantEntry(entry) {
  if (!entry || !entry.answer) return;
  const card = document.createElement('div');
  const sideClass = entry.side === 'assistant-right' ? 'assistant-right' : 'assistant-left';
  card.className = 'assistant-msg assistant-inline ' + sideClass;

  const head = document.createElement('div');
  head.className = 'assistant-head';
  const title = document.createElement('span');
  title.className = 'assistant-title';
  title.textContent = 'AI Assistant';
  const status = document.createElement('span');
  status.className = 'assistant-status';
  status.textContent = entry.provider ? providerLabel(entry.provider) : '';
  head.appendChild(title);
  head.appendChild(status);

  const body = document.createElement('div');
  body.className = 'assistant-body';
  body.textContent = cleanAssistantAnswerText(entry.answer);

  card.appendChild(head);
  card.appendChild(body);
  insertAssistantCard(card, null);
}

function renderStoredAssistantEntries(callId) {
  const entries = loadCallAssistantEntries(callId);
  entries.forEach(renderStoredAssistantEntry);
  trimAssistantCards();
}

function hydrateAssistantMemoryFromCall(callId) {
  const entries = loadCallAssistantEntries(callId);
  assistantMemory = entries.slice(-AI_MEMORY_MAX).map(entry => ({
    provider: entry.provider || '',
    source: clipMemoryText(entry.source || 'Previous resumed AI answer', AI_MEMORY_CONTEXT_MAX),
    answer: clipMemoryText(entry.answer || '', AI_MEMORY_ANSWER_MAX),
    at: entry.at || 0
  })).filter(entry => entry.answer);
  saveAssistantMemory();
}

function ensureNumberedOption(answer, number) {
  const text = cleanAssistantAnswerText(answer);
  if (!text) return '';
  const pattern = new RegExp('^\\s*' + number + '\\s*[\\).:：-]');
  return pattern.test(text) ? text : (number + ') ' + text);
}

function cleanAssistantAnswerText(answer) {
  let text = String(answer || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\s*(?:\[(?:\d+|source\s*\d+|источник\s*\d+)\])+/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

function combineAssistantOptions(quickAnswer, detailAnswer) {
  const parts = [];
  const quick = ensureNumberedOption(quickAnswer, 1);
  const detail = ensureNumberedOption(detailAnswer, 2);
  if (quick) parts.push(quick);
  if (detail) parts.push(detail);
  return parts.join('\n\n');
}

function trimAssistantCards() {
  const cards = Array.from(chat.querySelectorAll('.assistant-msg.assistant-inline'));
  while (cards.length > AI_VISIBLE_CARD_MAX) {
    cards.shift()?.remove();
  }
}

function openSuggestions() {
  aiSuggestionsOpen = true;
  document.getElementById('btn-suggestions').classList.add('on');
  if (allMessages.length === 0) {
    showToast('Waiting for transcript');
    return;
  }
  void fetchAiSuggestions(true);
}

function closeSuggestions() {
  aiSuggestionsOpen = false;
  aiSuggestionsQueued = false;
  document.getElementById('btn-suggestions').classList.remove('on');
  discardActiveAssistantCard();
  assistantMsgEl = null;
  assistantEntriesEl = null;
  assistantMemoryRendered = false;
}

function toggleSuggestions() {
  if (aiSuggestionsOpen) closeSuggestions();
  else openSuggestions();
}

function resetSuggestions(clearMemory = false) {
  lastSuggestionFingerprint = '';
  latestAssistantAnswer = '';
  aiSuggestionsQueued = false;
  clearTimeout(aiSuggestionTimer);
  if (clearMemory) clearAssistantMemory();
  chat.querySelectorAll('.assistant-msg').forEach(el => el.remove());
  assistantMsgEl = null;
  assistantEntriesEl = null;
  activeAssistantEntry = null;
  assistantMemoryRendered = false;
}

function scheduleSuggestionRefresh() {
  if (!aiSuggestionsOpen) return;
  clearTimeout(aiSuggestionTimer);
  aiSuggestionTimer = setTimeout(() => fetchAiSuggestions(false), AI_SUGGESTION_DEBOUNCE_MS);
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } catch (e) {
    if (timedOut || e?.name === 'AbortError' || String(e?.message || '').includes('aborted')) {
      const err = new Error(AI_REQUEST_TIMEOUT_MESSAGE);
      err.name = 'TimeoutError';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function isCurrentSuggestionRequest(requestSeq) {
  return aiSuggestionsOpen && requestSeq === aiSuggestionRequestSeq;
}

function isAiCooldownResponse(data) {
  return data?.status === AI_COOLDOWN_STATUS || data?.status === AI_UNAVAILABLE_STATUS;
}

function isAiTransientError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'TimeoutError'
    || message.includes('timed out')
    || message.includes('aborted')
    || message.includes('cooldown');
}

function compactAiErrors(errors) {
  const items = Array.isArray(errors) ? errors : [];
  return items
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('; ');
}

function aiStatusAnswer(data, fallback) {
  const retry = Number(data?.retry_after || 0);
  const details = compactAiErrors(data?.errors);
  if (retry > 0) {
    return '1) AI Assistant is waiting for provider cooldown (' + retry + 's). ' +
      'Capture continues.' + (details ? '\n\n' + details : '');
  }
  return '1) ' + (fallback || AI_ONLY_EMPTY_STATUS) + (details ? '\n\n' + details : '');
}

function renderAiOnlyStatus(data, fallback) {
  const state = data?.status || AI_UNAVAILABLE_STATUS;
  renderAssistantAnswer(aiStatusAnswer(data, fallback), data?.provider || '', state);
}

function scheduleAiCooldownRetry(data) {
  const retrySeconds = Number(data?.retry_after || 0);
  if (!retrySeconds || retrySeconds < 1 || !aiSuggestionsOpen) return;
  clearTimeout(aiSuggestionTimer);
  aiSuggestionTimer = setTimeout(
    () => fetchAiSuggestions(true),
    Math.min(retrySeconds + 1, 60) * 1000
  );
}

async function fetchAiSuggestions(force) {
  if (aiSuggestionsBusy) {
    aiSuggestionsQueued = true;
    return;
  }

  const messages = latestSuggestionMessages();
  if (messages.length === 0) {
    showToast('Waiting for transcript');
    return;
  }

  const fingerprint = suggestionFingerprint(messages);
  if (!force && fingerprint === lastSuggestionFingerprint) return;

  aiSuggestionsBusy = true;
  const requestSeq = ++aiSuggestionRequestSeq;
  renderAssistantAnswer('', '', 'loading');
  const basePayload = {
    messages,
    ai_memory: latestAiMemory(),
    prompt_context: currentAiPromptContext(),
    my_language: currentSettings.my_language || 'en',
    their_language: currentSettings.their_language || 'en',
    ai_answer_language: currentSettings.ai_answer_language || 'their'
  };
  let quickAnswer = '';
  let quickProvider = '';
  try {
    const quickResult = await fetchJsonWithTimeout('/api/suggestions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...basePayload, mode: 'quick', ai_provider: AI_QUICK_PROVIDER})
    }, AI_QUICK_REQUEST_TIMEOUT_MS);
    const quickResp = quickResult.response;
    const quickData = quickResult.data;
    if (!isCurrentSuggestionRequest(requestSeq)) return;
    if (isAiCooldownResponse(quickData)) {
      quickAnswer = aiStatusAnswer(quickData, AI_ONLY_EMPTY_STATUS);
      quickProvider = quickData.provider || '';
      lastSuggestionFingerprint = fingerprint;
      renderAssistantAnswer(quickAnswer, quickProvider, quickData.status || AI_COOLDOWN_STATUS);
      scheduleAiCooldownRetry(quickData);
      return;
    } else if (!quickResp.ok || quickData.error) {
      throw new Error(quickData.error || 'quick suggestion request failed');
    } else {
      quickAnswer = quickData.answer || (quickData.suggestions || []).join('\n\n');
      quickProvider = quickData.provider || '';
      const quickDisplay = combineAssistantOptions(quickAnswer, 'Thinking...');
      renderAssistantAnswer(quickDisplay, quickProvider, 'partial');
    }

    const detailResult = await fetchJsonWithTimeout('/api/suggestions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ...basePayload,
        mode: 'detail',
        ai_provider: AI_DETAIL_PROVIDER,
        quick_answer: quickProvider ? quickAnswer : ''
      })
    }, AI_DETAIL_REQUEST_TIMEOUT_MS);
    const detailResp = detailResult.response;
    const detailData = detailResult.data;
    if (!isCurrentSuggestionRequest(requestSeq)) return;
    if (isAiCooldownResponse(detailData)) {
      lastSuggestionFingerprint = fingerprint;
      renderAssistantAnswer(quickAnswer, quickProvider, quickAnswer ? 'ready' : AI_COOLDOWN_STATUS);
      if (quickAnswer) rememberAssistantAnswer(quickAnswer, quickProvider, messages);
      return;
    }
    if (!detailResp.ok || detailData.error) {
      throw new Error(detailData.error || 'detailed suggestion request failed');
    }
    const detailAnswer = detailData.answer || (detailData.suggestions || []).join('\n\n');
    const provider = combinedProvider(quickProvider, detailData.provider);
    const answer = combineAssistantOptions(quickAnswer, detailAnswer);
    lastSuggestionFingerprint = fingerprint;
    renderAssistantAnswer(answer, provider, answer ? 'ready' : 'empty');
    if (answer) rememberAssistantAnswer(answer, provider, messages);
  } catch (e) {
    if (!isCurrentSuggestionRequest(requestSeq)) return;
    console.warn('AI suggestions failed:', e);
    if (quickAnswer) {
      const answer = isAiTransientError(e)
        ? quickAnswer
        : combineAssistantOptions(quickAnswer, 'Detailed answer unavailable: ' + (e.message || 'AI assistant unavailable'));
      lastSuggestionFingerprint = fingerprint;
      renderAssistantAnswer(answer, quickProvider, 'ready');
      rememberAssistantAnswer(answer, quickProvider, messages);
    } else if (isAiTransientError(e)) {
      lastSuggestionFingerprint = fingerprint;
      renderAiOnlyStatus({ status: AI_COOLDOWN_STATUS }, e.message || AI_REQUEST_TIMEOUT_MESSAGE);
    } else {
      renderAssistantAnswer(e.message || 'AI assistant unavailable', '', 'error');
    }
  } finally {
    aiSuggestionsBusy = false;
    if (aiSuggestionsQueued && aiSuggestionsOpen) {
      aiSuggestionsQueued = false;
      setTimeout(() => fetchAiSuggestions(false), AI_SUGGESTION_RETRY_DELAY_MS);
    }
  }
}

// ===== Bookmarks =====
function toggleBookmarkFilter() {
  bookmarkFilterOn = !bookmarkFilterOn;
  document.getElementById('btn-bookmarks').classList.toggle('on', bookmarkFilterOn);
  allMessages.forEach(m => {
    m.el.style.display = (bookmarkFilterOn && !m.bookmarked) ? 'none' : '';
  });
  chat.querySelectorAll('.direction-label, .time-sep').forEach(el => {
    el.style.display = bookmarkFilterOn ? 'none' : '';
  });
  scrollBottom(true);
}

// ===== Export =====
function exportChat() {
  const lines = [];
  allMessages.forEach(m => {
    pushExportMessage(lines, m);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'transcript-' + new Date().toISOString().slice(0, 16).replace(':', '-') + '.txt';
  a.click();
  showToast('Exported!');
}

function pushExportMessage(lines, message) {
  const dir = speakerPrefix(message.direction);
  const bookmarkSuffix = message.bookmarked ? ' *' : '';
  const transcript = String(message.transcript || '').trim();
  const translation = String(message.translation || '').trim();
  const sameText = messageTextsAreSame(transcript, translation);

  if (transcript) {
    const suffix = sameText || !translation ? bookmarkSuffix : '';
    lines.push('[' + dir + '] ' + transcript + suffix);
  }
  if (translation && !sameText) {
    lines.push('[' + dir + '] >> ' + translation + bookmarkSuffix);
  }
  lines.push('');
}

function messageTextsAreSame(left, right) {
  return Boolean(left && right && normalizeMessageText(left) === normalizeMessageText(right));
}

// ===== Helpers =====
function latencyClass(ms) { return ms < 400 ? 'fast' : ms < 800 ? 'medium' : 'slow'; }
function avg(arr) {
  if (!arr.length) return '-';
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) + 'ms';
}
function updateStats() {
  document.getElementById('avg-stt').textContent = avg(stats.stt);
  document.getElementById('avg-trl').textContent = avg(stats.trl);
  document.getElementById('avg-tts').textContent = avg(stats.tts);
  document.getElementById('avg-lat').textContent = avg(stats.lat);
  document.getElementById('total').textContent = stats.count;
}
function isChatNearBottom() {
  const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
  return distance <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollBottom(force = false) {
  if (force || isChatNearBottom()) {
    chat.scrollTop = chat.scrollHeight;
  }
}

function scrollBottomIfPinned(keepPinned) {
  if (keepPinned) {
    chat.scrollTop = chat.scrollHeight;
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== Time separators =====
function maybeAddTimeSep() {
  const now = Date.now();
  if (lastMsgTime && (now - lastMsgTime) > 60000) {
    const gap = Math.round((now - lastMsgTime) / 1000);
    const sep = document.createElement('div');
    sep.className = 'time-sep';
    sep.textContent = gap < 120 ? gap + 's pause' : Math.round(gap / 60) + ' min pause';
    chat.insertBefore(sep, typingEl);
  }
  lastMsgTime = now;
}

// ===== Typing indicator =====
function showTyping() {
  const keepPinned = isChatNearBottom();
  typingEl.classList.add('visible');
  scrollBottomIfPinned(keepPinned);
}
function hideTyping() { typingEl.classList.remove('visible'); }

// ===== Typewriter =====
function typewrite(el, text) {
  let i = 0;
  el.textContent = '';
  function tick() {
    if (i < text.length) {
      const keepPinned = isChatNearBottom();
      el.textContent += text[i++];
      scrollBottomIfPinned(keepPinned);
      setTimeout(tick, 18);
    }
  }
  tick();
}

// ===== Chat messages =====
function speakerId(direction) {
  return SPEAKER_IDS[direction] || 'S?';
}

function speakerRole(direction) {
  return SPEAKER_ROLES[direction] || 'Unknown';
}

function speakerPrefix(direction) {
  return speakerId(direction) + ' ' + speakerRole(direction);
}

function directionLabel(direction) {
  const myL = (currentSettings.my_language || 'RU').toUpperCase();
  const theirL = (currentSettings.their_language || 'EN').toUpperCase();
  const speaker = speakerPrefix(direction);
  if (transcriptOnlyMode) {
    return direction === 'outgoing' ? speaker + ' (' + myL + ')' : speaker + ' (' + theirL + ')';
  }
  return direction === 'outgoing'
    ? speaker + ' (' + myL + ' \u2192 ' + theirL + ')'
    : speaker + ' (' + theirL + ' \u2192 ' + myL + ')';
}

function flushPending() {
  const displayText = transcriptOnlyMode
    ? (pending.transcript || pending.translation || '')
    : (pending.translation || '');
  if (!pending.direction || !displayText) return;
  const keepPinned = isChatNearBottom();
  const currentMessage = {
    direction: pending.direction,
    transcript: normalizeMessageText(pending.transcript),
    translation: normalizeMessageText(displayText),
    at: Date.now()
  };
  if (isDuplicatePending()) {
    pending = { direction: null, transcript: null, translation: null };
    hideTyping();
    return;
  }
  removeEarlierCrossTalkFragments(currentMessage);
  hideTyping();
  maybeAddTimeSep();

  if (pending.direction !== lastRenderedDirection) {
    const label = document.createElement('div');
    label.className = 'direction-label ' + pending.direction;
    label.textContent = directionLabel(pending.direction);
    chat.insertBefore(label, typingEl);
    lastRenderedDirection = pending.direction;
  }

  const msg = document.createElement('div');
  msg.className = 'msg ' + pending.direction;
  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = '\u2606';
  msg.appendChild(star);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  msg.appendChild(bubble);
  const translationText = displayText;
  const transcriptText = pending.transcript;
  bubble.onclick = () => copyBubble(translationText);
  chat.insertBefore(msg, typingEl);
  lastMsgEl = msg;

  const msgData = {
    el: msg, direction: pending.direction,
    transcript: transcriptText, translation: translationText, bookmarked: false, at: Date.now()
  };
  allMessages.push(msgData);
  lastRenderedMessage = {
    direction: pending.direction,
    transcript: normalizeMessageText(transcriptText),
    translation: normalizeMessageText(translationText),
    at: Date.now()
  };
  recentRenderedMessages.push(lastRenderedMessage);
  recentRenderedMessages = recentRenderedMessages
    .filter(item => (Date.now() - item.at) <= 15000)
    .slice(-20);
  star.onclick = (e) => {
    e.stopPropagation();
    msgData.bookmarked = !msgData.bookmarked;
    star.textContent = msgData.bookmarked ? '\u2605' : '\u2606';
    star.classList.toggle('on', msgData.bookmarked);
    msg.classList.toggle('bookmarked', msgData.bookmarked);
  };
  typewrite(bubble, translationText);
  if (!transcriptOnlyMode) {
    speakTranslationWithExternalTts(translationText, pending.direction);
  }
  stats.count++;
  updateStats();
  scheduleSuggestionRefresh();
  scrollBottomIfPinned(keepPinned);
  pending = { direction: null, transcript: null, translation: null };
}

function renderStoredMessage(item) {
  const direction = item.direction === 'incoming' ? 'incoming' : 'outgoing';
  const translationText = item.translated || item.translation || '';
  const transcriptText = item.original || item.transcript || '';
  if (!translationText && !transcriptText) return;

  if (direction !== lastRenderedDirection) {
    const label = document.createElement('div');
    label.className = 'direction-label ' + direction;
    label.textContent = directionLabel(direction);
    chat.insertBefore(label, typingEl);
    lastRenderedDirection = direction;
  }

  const msg = document.createElement('div');
  msg.className = 'msg ' + direction;
  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = '\u2606';
  msg.appendChild(star);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = translationText || transcriptText;
  bubble.onclick = () => copyBubble(translationText || transcriptText);
  msg.appendChild(bubble);
  chat.insertBefore(msg, typingEl);
  lastMsgEl = msg;

  const at = Date.parse(String(item.ts || '').replace(' ', 'T')) || Date.now();
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = item.ts ? String(item.ts).slice(11, 19) : 'history';
  msg.appendChild(meta);

  const msgData = {
    el: msg,
    direction,
    transcript: transcriptText,
    translation: translationText || transcriptText,
    bookmarked: false,
    at
  };
  allMessages.push(msgData);
  star.onclick = (e) => {
    e.stopPropagation();
    msgData.bookmarked = !msgData.bookmarked;
    star.textContent = msgData.bookmarked ? '\u2605' : '\u2606';
    star.classList.toggle('on', msgData.bookmarked);
    msg.classList.toggle('bookmarked', msgData.bookmarked);
  };
  stats.count++;
}

async function loadResumedCallFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('resume_call');
  const callId = parseInt(rawId || '', 10);
  if (!Number.isFinite(callId) || callId <= 0) return;
  resumeAutoStart = params.get('autostart') === '1';

  try {
    const resumeResp = await fetch('/api/calls/' + callId + '/resume', { method: 'POST' });
    const resumeData = await resumeResp.json();
    if (!resumeResp.ok || resumeData.error) throw new Error(resumeData.error || 'Failed to resume call');

    const detailResp = await fetch('/api/calls/' + callId);
    const detail = await detailResp.json();
    if (!detailResp.ok || detail.error) throw new Error(detail.error || 'Failed to load call');

    clearAll();
    activeCallId = callId;
    resumedCallId = callId;
    resumedCallLoaded = true;
    const call = detail.call || {};
    if (call.my_language) currentSettings.my_language = call.my_language;
    if (call.their_language) currentSettings.their_language = call.their_language;
    (detail.utterances || []).forEach(renderStoredMessage);
    updateStats();
    resetSuggestions(false);
    hydrateAssistantMemoryFromCall(callId);
    renderStoredAssistantEntries(callId);
    if (aiSuggestionsOpen && allMessages.length) scheduleSuggestionRefresh();
    showToast(resumeAutoStart ? 'History loaded. Starting...' : 'History loaded. Press Start to continue.');
    scrollBottom(true);
    maybeAutoStartResumedCall();
  } catch (e) {
    console.warn('Failed to resume call:', e);
    showToast(e.message || 'Failed to load history');
  }
}

function maybeAutoStartResumedCall() {
  if (!resumeAutoStart || !resumedCallLoaded || !bootReady || !engineReady) return;
  if (engineRunning || engineToggleBusy) return;
  resumeAutoStart = false;
  setTimeout(() => {
    if (!engineRunning && !engineToggleBusy) toggleEngine();
  }, 350);
}

function normalizeAppSecTerms(text) {
  return APPSEC_TERM_REPLACEMENTS.reduce(
    (current, replacement) => current.replace(replacement[0], replacement[1]),
    String(text || '').trim()
  );
}

function normalizeMessageText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textsLookAlike(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.65;
}

function messagesLookAlike(a, b) {
  const aTexts = [a.transcript, a.translation].filter(Boolean);
  const bTexts = [b.transcript, b.translation].filter(Boolean);
  return aTexts.some(left => bTexts.some(right => textsLookAlike(left, right)));
}

function normalizedWordCount(text) {
  const normalized = normalizeMessageText(text);
  return normalized ? normalized.split(/\s+/).length : 0;
}

function normalizedWords(text) {
  const normalized = normalizeMessageText(text);
  return normalized ? normalized.split(/\s+/) : [];
}

function hasStrongWordOverlap(fragment, source) {
  const fragmentWords = normalizedWords(fragment);
  const sourceWords = new Set(normalizedWords(source));
  if (fragmentWords.length === 0 || fragmentWords.length > CROSSTALK_WORD_OVERLAP_MAX_WORDS) {
    return false;
  }

  const overlap = fragmentWords.filter(word => sourceWords.has(word)).length;
  return overlap / fragmentWords.length >= CROSSTALK_WORD_OVERLAP_MIN_RATIO;
}

function isLikelyCrossTalkEcho(fragmentText, sourceText, maxAgeMs) {
  const fragment = normalizeMessageText(fragmentText);
  const source = normalizeMessageText(sourceText);
  if (!fragment || !source || fragment === source) return false;

  const fragmentWords = normalizedWordCount(fragment);
  if (fragmentWords === 0) return false;
  if (!source.includes(fragment)) {
    return textsLookAlike(fragment, source) || hasStrongWordOverlap(fragment, source);
  }

  if (fragmentWords >= CROSSTALK_SUBSTRING_MIN_WORDS || fragment.length >= CROSSTALK_SUBSTRING_MIN_CHARS) {
    return true;
  }
  return maxAgeMs <= CROSSTALK_SHORT_ECHO_WINDOW_MS &&
    fragmentWords <= 2 &&
    fragment.length >= CROSSTALK_MIN_SHORT_FRAGMENT_CHARS;
}

function messageTexts(message) {
  return [message.transcript, message.translation]
    .map(normalizeMessageText)
    .filter(Boolean);
}

function isCrossTalkEcho(candidate, source, maxAgeMs) {
  if (!candidate || !source || candidate.direction === source.direction) return false;
  const candidateTexts = messageTexts(candidate);
  const sourceTexts = messageTexts(source);
  return candidateTexts.some(fragment =>
    sourceTexts.some(full => isLikelyCrossTalkEcho(fragment, full, maxAgeMs))
  );
}

function removeRenderedMessage(message) {
  if (!message || !message.el) return;
  message.el.remove();
  allMessages = allMessages.filter(item => item !== message);
  recentRenderedMessages = recentRenderedMessages.filter(item =>
    item.direction !== message.direction || !messagesLookAlike(item, message)
  );
  if (lastMsgEl === message.el) lastMsgEl = latestMessageElement();
  if (lastRenderedMessage?.direction === message.direction && messagesLookAlike(lastRenderedMessage, message)) {
    lastRenderedMessage = recentRenderedMessages[recentRenderedMessages.length - 1] || null;
  }
}

function removeEarlierCrossTalkFragments(current) {
  if (current.direction !== 'incoming') return;
  const now = Date.now();
  const staleOutgoing = allMessages.filter(message =>
    message.direction === 'outgoing' &&
    now - message.at <= CROSSTALK_EARLIER_ECHO_WINDOW_MS &&
    isCrossTalkEcho(message, current, now - message.at)
  );
  staleOutgoing.forEach(removeRenderedMessage);
}

function isDuplicatePending() {
  if (!lastRenderedMessage) return false;
  const now = Date.now();
  const current = {
    direction: pending.direction,
    transcript: normalizeMessageText(pending.transcript),
    translation: normalizeMessageText(pending.translation),
  };

  for (const recent of recentRenderedMessages) {
    const age = now - recent.at;
    if (age > CROSSTALK_EARLIER_ECHO_WINDOW_MS) continue;

    if (recent.direction === current.direction) {
      if (age <= SAME_DIRECTION_DUPLICATE_WINDOW_MS && messagesLookAlike(recent, current)) {
        return true;
      }
      continue;
    }

    if (age <= CROSSTALK_LATE_ECHO_WINDOW_MS && recent.direction !== current.direction && messagesLookAlike(recent, current)) {
      return true;
    }

    if (age <= CROSSTALK_LATE_ECHO_WINDOW_MS && isCrossTalkEcho(current, recent, age)) {
      return true;
    }
  }

  return false;
}

function processLine(line) {
  let m = line.match(/^⚠ Audio device lost \[(?:S[12]\s+)?(outgoing|incoming)\]: (.+)$/);
  if (m) {
    showToast(('Audio device lost: ' + m[2]).slice(0, 140));
    void checkAudioDeviceHotplug('native');
    return;
  }

  m = line.match(/^✖ Engine error: (.+)$/);
  if (m) {
    showToast(m[1].slice(0, 120));
    void syncEngineState();
    return;
  }
  if (line.startsWith('▶ Engine started') || line.startsWith('■ Engine stopped')) {
    void syncEngineState();
    return;
  }

  m = line.match(/\uD83C\uDFA4 \[(?:S[12]\s+)?(outgoing|incoming)\] (.+)/);
  if (m) {
    flushPending();
    pending.direction = m[1];
    pending.transcript = normalizeAppSecTerms(m[2]);
    showTyping();
    return;
  }
  m = line.match(/\uD83C\uDF10 \[(?:S[12]\s+)?(outgoing|incoming)\] (.+)/);
  if (m) {
    pending.direction = m[1];
    if (transcriptOnlyMode) {
      pending.transcript = pending.transcript || normalizeAppSecTerms(m[2]);
      pending.translation = pending.transcript;
    } else {
      pending.translation = m[2];
    }
    flushPending();
    return;
  }
  m = line.match(/\u23F1\s+stt=(\d+)ms\s+trl=(\d+)ms\s+tts=(\d+)ms/);
  if (m) {
    const keepPinned = isChatNearBottom();
    const stt = parseInt(m[1]), trl = parseInt(m[2]), tts = parseInt(m[3]);
    const total = stt + trl + tts;
    stats.stt.push(stt); stats.trl.push(trl); stats.tts.push(tts); stats.lat.push(total);
    updateStats();
    if (lastMsgEl) {
      const meta = lastMsgEl.querySelector('.meta') || document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span class="' + latencyClass(stt) + '">stt ' + stt + 'ms</span>' +
        '<span class="' + latencyClass(trl) + '">trl ' + trl + 'ms</span>' +
        '<span class="' + latencyClass(tts) + '">tts ' + tts + 'ms</span>' +
        '<span class="' + latencyClass(total) + '">= ' + total + 'ms</span>';
      if (!meta.parentNode) lastMsgEl.appendChild(meta);
      scrollBottomIfPinned(keepPinned);
    }
  }
}

// ===== Engine commands =====
async function sendCmd(cmd) {
  const resp = await fetch('/cmd', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({cmd})
  });
  return resp.json();
}

async function checkProviderKey(provider, key) {
  const r = await fetch('/api/test-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ provider, key })
  });
  return r.json();
}

async function preflightStartChecks() {
  const dgEl = document.getElementById('cfg-deepgram');
  const deepgramKey = ((dgEl && dgEl._getRealValue) ? dgEl._getRealValue() : (currentSettings.deepgram_api_key || '')).trim();

  if (!transcriptOnlyMode && isSameLanguageTranslationPair()) {
    showToast(SAME_LANGUAGE_TRANSLATION_HINT);
    openSettings();
    return false;
  }

  if (!deepgramKey) {
    showToast('Set Deepgram API key first');
    openSettings();
    return false;
  }

  return true;
}

function normalizeEngineStatus(raw) {
  if (!raw) return 'unknown';
  return raw.startsWith('ok:') ? raw.slice(3) : raw;
}

function applyEngineState(status) {
  const btn = document.getElementById('btn-engine');
  const icon = document.getElementById('engine-icon');
  const text = document.getElementById('engine-toggle-text');
  const normalized = normalizeEngineStatus(status);

  if (normalized === 'running' || normalized === 'starting' || tabCaptureActive) {
    engineRunning = true;
    btn.className = 'btn btn-engine running';
    icon.innerHTML = '&#9724;';
    text.textContent = 'Stop';
    const virtualRunning = tabCaptureActive && normalized !== 'running' && normalized !== 'starting';
    setEnginePill(
      normalized === 'starting' ? 'restarting' : 'running',
      normalized === 'starting' ? 'Starting...' : (virtualRunning ? 'Monitor' : 'Running')
    );
    if (timerPaused) {
      sessionStart = Date.now();
      timerOffset = 0;
      timerPaused = false;
    }
    updateMonitorButton();
    return virtualRunning ? 'running' : normalized;
  }

  engineRunning = false;
  updateMonitorButton();
  btn.className = 'btn btn-engine stopped';
  icon.innerHTML = '&#9654;';
  text.textContent = 'Start';

  if (normalized === 'stopping') setEnginePill('restarting', 'Stopping...');
  else if (normalized === 'crashed') setEnginePill('stopped', 'Error');
  else setEnginePill('stopped', 'Stopped');

  if (!timerPaused) {
    timerPaused = true;
    timerPausedAt = Date.now();
  }

  return normalized;
}

async function syncEngineState() {
  try {
    const data = await sendCmd('status');
    return applyEngineState(data.status || '');
  } catch (e) {
    return applyEngineState('crashed');
  }
}

// ===== Monitor =====
let monitorEnabled = false;
let audioCtx = null;
let monitorQueue = [];
let monitorPlaying = false;
let monitorStartedTabCapture = false;
let monitorStartedEngine = false;
let monitorStartCommandOverride = '';
let browserMonitorPlaybackSynced = null;

function updateMonitorButton() {
  const btn = document.getElementById('btn-monitor');
  if (!btn) return;

  const nativeCaptureActive = isNativeMonitorCaptureActive();
  const captureActive = tabCaptureActive || nativeCaptureActive;
  const active = monitorEnabled || tabCaptureStarting || captureActive;
  btn.classList.toggle('on', active);
  btn.classList.toggle('capturing', tabCaptureStarting || captureActive);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.title = captureActive
    ? 'Monitor is capturing shared browser/system audio'
    : tabCaptureStarting
      ? 'Opening browser/system audio picker'
      : 'Capture browser audio and play translations in browser';

  const label = document.getElementById('monitor-label');
  if (label) {
    label.textContent = captureActive ? 'Capturing' : (tabCaptureStarting ? 'Opening...' : 'Monitor');
  }
}

function isNativeMonitorCaptureActive() {
  const callCapture = document.getElementById('cfg-call-output')?.value || currentSettings.meet_input_device || 'default';
  return Boolean(engineRunning && !muteState.incoming && !tabCaptureActive && isUsableLoopbackDevice(callCapture));
}

function setMonitorEnabled(enabled) {
  monitorEnabled = Boolean(enabled);
  updateMonitorButton();
}

function setTabCaptureStarting(starting) {
  tabCaptureStarting = Boolean(starting);
  updateMonitorButton();
}

function setTabCaptureActive(active) {
  tabCaptureActive = Boolean(active);
  updateMonitorButton();
}

function updateTextOnlyButton() {
  const btn = document.getElementById('btn-text-only');
  if (!btn) return;
  btn.classList.toggle('on', textOnlyMode);
  btn.setAttribute('aria-pressed', textOnlyMode ? 'true' : 'false');
  btn.title = textOnlyMode
    ? 'Sound is disabled; translations stay text-only'
    : 'Disable translated speech output; keep text only';
  const label = document.getElementById('text-only-label');
  if (label) label.textContent = 'Text Only';
}

function updateTranscriptOnlyButton() {
  const btn = document.getElementById('btn-transcript-only');
  if (!btn) return;
  btn.classList.toggle('on', transcriptOnlyMode);
  btn.classList.toggle('translation-off', transcriptOnlyMode);
  btn.setAttribute('aria-pressed', transcriptOnlyMode ? 'true' : 'false');
  let title = transcriptOnlyMode ? TRANSLATION_OFF_HINT : TRANSLATION_ON_HINT;
  if (!transcriptOnlyMode && isSameLanguageTranslationPair()) {
    title = SAME_LANGUAGE_TRANSLATION_HINT;
  }
  btn.title = title;
  btn.setAttribute('aria-label', title);
}

function updateTranscriptHiddenButton() {
  const btn = document.getElementById('btn-hide-transcript');
  if (!btn) return;
  const title = transcriptHiddenMode ? TRANSCRIPT_HIDDEN_OFF_HINT : TRANSCRIPT_HIDDEN_ON_HINT;
  btn.classList.toggle('on', transcriptHiddenMode);
  btn.setAttribute('aria-pressed', transcriptHiddenMode ? 'true' : 'false');
  btn.title = title;
  btn.setAttribute('aria-label', title);
}

function updateTranscriptHiddenMode() {
  chat.classList.toggle('transcript-hidden', transcriptHiddenMode);
  updateTranscriptHiddenButton();
}

function getSelectedLanguagePair() {
  const myLang = document.getElementById('cfg-my-lang')?.value || currentSettings.my_language || '';
  const theirLang = document.getElementById('cfg-their-lang')?.value || currentSettings.their_language || '';
  return {
    myLang: String(myLang).trim().toLowerCase(),
    theirLang: String(theirLang).trim().toLowerCase()
  };
}

function isSameLanguageTranslationPair() {
  const pair = getSelectedLanguagePair();
  return Boolean(pair.myLang && pair.myLang === pair.theirLang);
}

function applySavedSettings(settings) {
  currentSettings = settings;

  const myLang = document.getElementById('cfg-my-lang');
  const theirLang = document.getElementById('cfg-their-lang');
  const aiAnswerLanguage = document.getElementById('cfg-ai-answer-language');
  if (myLang && settings.my_language) myLang.value = settings.my_language;
  if (theirLang && settings.their_language) theirLang.value = settings.their_language;
  if (aiAnswerLanguage) aiAnswerLanguage.value = settings.ai_answer_language || 'their';

  textOnlyMode = !!settings.text_only_mode;
  transcriptOnlyMode = !!settings.transcript_only_mode || settings.translation_enabled === false;
  transcriptHiddenMode = !!settings.transcript_hidden_mode;

  updateTextOnlyButton();
  updateTranscriptOnlyButton();
  updateTranscriptHiddenMode();
}

async function saveSettingsPayload(settings) {
  const response = await fetch('/api/settings', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(settings)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Failed to save settings');
  }
  const savedSettings = data.settings || settings;
  applySavedSettings(savedSettings);
  return savedSettings;
}

async function persistTextOnlyMode() {
  const settings = { ...readForm(), text_only_mode: textOnlyMode };
  await saveSettingsPayload(settings);
}

async function persistTranscriptOnlyMode() {
  const settings = {
    ...readForm(),
    transcript_only_mode: transcriptOnlyMode,
    translation_enabled: !transcriptOnlyMode
  };
  await saveSettingsPayload(settings);
}

async function persistTranscriptHiddenMode() {
  const settings = { ...readForm(), transcript_hidden_mode: transcriptHiddenMode };
  await saveSettingsPayload(settings);
}

async function applyTextOnlyMode(sendToEngine = true, persist = false) {
  updateTextOnlyButton();
  if (sendToEngine) {
    try {
      await sendCmd(textOnlyMode ? 'text_only_on' : 'text_only_off');
      await syncMonitorAudioMode();
    } catch (e) {
      console.warn('Failed to update text-only mode in engine:', e);
    }
  }
  if (textOnlyMode) {
    monitorQueue = [];
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      await fetch('/api/poll-audio');
    } catch (e) {
      console.warn('Failed to clear queued audio:', e);
    }
  }
  if (persist) {
    try {
      await persistTextOnlyMode();
    } catch (e) {
      console.warn('Failed to save text-only mode:', e);
    }
  }
}

async function applyTranscriptOnlyMode(sendToEngine = true, persist = false) {
  updateTranscriptOnlyButton();
  const enablingTranslation = !transcriptOnlyMode;
  if (persist) {
    try {
      await persistTranscriptOnlyMode();
    } catch (e) {
      console.warn('Failed to save translation mode:', e);
    }
  }
  if (sendToEngine) {
    try {
      if (enablingTranslation && engineRunning && !tabCaptureActive) {
        const startCmd = getEngineStartCommand();
        if (startCmd) {
          await restartPipelinesForCurrentSettings(startCmd);
        } else {
          await sendCmd('translation_on');
          await syncMonitorAudioMode();
        }
      } else {
        await sendCmd(transcriptOnlyMode ? 'translation_off' : 'translation_on');
        await syncMonitorAudioMode();
      }
    } catch (e) {
      console.warn('Failed to update translation mode in engine:', e);
    }
  }
  if (transcriptOnlyMode) {
    monitorQueue = [];
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      await fetch('/api/poll-audio');
    } catch (e) {
      console.warn('Failed to clear queued audio:', e);
    }
  }
}

async function toggleTextOnly() {
  textOnlyMode = !textOnlyMode;
  await applyTextOnlyMode(true, true);
  showToast(textOnlyMode ? 'Text only ON' : 'Sound ON');
}

async function toggleTranscriptOnly() {
  transcriptOnlyMode = !transcriptOnlyMode;
  await applyTranscriptOnlyMode(true, true);
  showToast(transcriptOnlyMode ? 'Translation OFF' : (isSameLanguageTranslationPair() ? SAME_LANGUAGE_TRANSLATION_HINT : 'Translation ON'));
}

async function toggleTranscriptHidden() {
  transcriptHiddenMode = !transcriptHiddenMode;
  updateTranscriptHiddenMode();
  if (transcriptHiddenMode && aiSuggestionsOpen && allMessages.length) {
    void fetchAiSuggestions(true);
  }
  try {
    await persistTranscriptHiddenMode();
  } catch (e) {
    console.warn('Failed to save transcript visibility mode:', e);
  }
  showToast(transcriptHiddenMode ? 'AI Only ON' : 'Transcript visible');
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    return audioCtx.resume();
  }
  return Promise.resolve();
}

async function toggleMonitor() {
  setMonitorEnabled(!monitorEnabled);
  // Unlock AudioContext on user gesture
  if (monitorEnabled) {
    await ensureAudioContext();

    if (shouldMonitorStartTabCapture()) {
      monitorStartedTabCapture = true;
      const started = await startTabCapture(defaultMonitorCaptureDirection());
      if (!started) {
        monitorStartedTabCapture = false;
        setMonitorEnabled(false);
        await syncMonitorAudioMode();
        return;
      }
      if (!tabCaptureActive) {
        monitorStartedTabCapture = false;
        updateMonitorButton();
      }
      await syncMonitorAudioMode();
      showToast('Monitor capturing browser sound');
      return;
    }

    const backendState = await syncEngineState();
    const monitorStartCmd = getMonitorEngineStartCommand();
    const engineStartCmd = getEngineStartCommand();
    if ((backendState !== 'running' && backendState !== 'starting') && monitorStartCmd && engineStartCmd) {
      await prepareMonitorEngineStart(engineStartCmd);
      await syncMonitorAudioMode();
      showToast('Starting Monitor...');
      monitorStartedEngine = true;
      monitorStartCommandOverride = engineStartCmd;
      await toggleEngine();
      return;
    }
  } else if (monitorStartedTabCapture && tabCaptureActive) {
    monitorStartedTabCapture = false;
    stopTabCapture(false);
  } else {
    const backendState = await syncEngineState();
    if (monitorStartedEngine && (backendState === 'running' || backendState === 'starting')) {
      monitorStartedEngine = false;
      await toggleEngine();
      return;
    }
  }
  await syncMonitorAudioMode();
  showToast(monitorEnabled ? 'Monitor ON' : 'Monitor OFF');
}

function shouldMonitorStartTabCapture() {
  return Boolean(
    !tabCaptureActive &&
    currentSettings.deepgram_api_key &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia
  );
}

function getMonitorEngineStartCommand() {
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';
  const canCaptureConfiguredIncoming = isUsableInputDevice(callCapture, false) || isUsableLoopbackDevice(callCapture);
  const canCaptureMonitorIncoming = monitorEnabled && isUsableLoopbackDevice(SYSTEM_LOOPBACK_DEVICE);
  const canCaptureIncoming = canCaptureConfiguredIncoming || canCaptureMonitorIncoming;
  return canCaptureIncoming ? 'start_incoming' : '';
}

async function prepareMonitorEngineStart(startCmd) {
  if (startCmd === 'start_incoming' || startCmd === 'start') {
    const callCapture = document.getElementById('cfg-call-output');
    if (callCapture && availableAudioOutputs.length > 0 && !isUsableLoopbackDevice(callCapture.value)) {
      callCapture.value = SYSTEM_LOOPBACK_DEVICE;
    }
    if (muteState.incoming) {
      await setDirectionMuted('incoming', false);
    }
  }

  await saveSettings();
}

async function syncMonitorAudioMode() {
  try {
    const browserPlaybackActive = monitorEnabled && !textOnlyMode && !transcriptOnlyMode && !tabCaptureActive;
    if (browserMonitorPlaybackSynced === browserPlaybackActive) return;
    await sendCmd(browserPlaybackActive ? 'monitor_audio_on' : 'monitor_audio_off');
    browserMonitorPlaybackSynced = browserPlaybackActive;
  } catch (e) {
    console.warn('Failed to update monitor audio mode in engine:', e);
  }
}

async function playAudioItem(item, force = false) {
  if (!item) return;
  if ((textOnlyMode || transcriptOnlyMode) && !force) return;
  await ensureAudioContext();
  const { sr, b64 } = item;
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer);
  const floats = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    floats[i] = pcm16[i] / 32768.0;
  }
  const buf = audioCtx.createBuffer(1, floats.length, sr);
  buf.getChannelData(0).set(floats);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.8;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
  await new Promise(r => { src.onended = r; });
}

// Poll for audio and play via AudioContext
async function pollAudio() {
  if (!monitorEnabled || !audioCtx) return;
  if (textOnlyMode || transcriptOnlyMode || tabCaptureActive) {
    monitorQueue = [];
    try { await fetch('/api/poll-audio'); } catch(e) {}
    return;
  }
  try {
    const r = await fetch('/api/poll-audio');
    const items = await r.json();
    for (const item of items) {
      monitorQueue.push(item);
    }
    if (items.length > 0 && !monitorPlaying) drainMonitorQueue();
  } catch(e) { console.error('[MONITOR] poll error:', e); }
}

async function drainMonitorQueue() {
  monitorPlaying = true;
  while (monitorQueue.length > 0) {
    const item = monitorQueue.shift();
    try {
      await playAudioItem(item);
    } catch(e) {
      console.warn('Monitor playback error:', e);
    }
  }
  monitorPlaying = false;
}

// Poll every 500ms when monitor is on
setInterval(pollAudio, 500);

// ===== Browser Audio Capture =====
let tabCaptureActive = false;
let tabStream = null;
let tabRecorder = null;
let tabDgSocket = null;
let tabFinalText = '';
let tabLiveText = '';
let tabFinalFlushTimer = null;
let tabCaptureDirection = 'incoming';
let tabCaptureStarting = false;

const TAB_UTTERANCE_SILENCE_MS = 2000;

const DG_LANG_MAP = { pt: 'pt-BR', no: 'nb' };
function dgLang(code) { return DG_LANG_MAP[code] || code; }

function deepgramKeytermsSupported(lang) {
  return dgLang(lang || '').split('-')[0].toLowerCase() === 'en';
}

function appendDeepgramKeyterms(params, lang) {
  if (!deepgramKeytermsSupported(lang)) {
    return;
  }

  let keytermQueryChars = 0;

  for (const term of DEEPGRAM_KEYTERMS) {
    const encodedTerm = encodeURIComponent(term).replace(/%20/g, '+');
    const nextLen = KEYTERM_QUERY_PREFIX.length + encodedTerm.length;
    if (keytermQueryChars + nextLen > MAX_KEYTERM_QUERY_CHARS) {
      break;
    }

    params.append('keyterm', term);
    keytermQueryChars += nextLen;
  }
}

function deepgramListenUrl(lang) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: dgLang(lang || 'en'),
    interim_results: 'true',
    endpointing: String(currentSettings.endpointing_ms || 700),
    punctuate: 'true',
    smart_format: 'true'
  });
  appendDeepgramKeyterms(params, lang);
  return 'wss://api.deepgram.com/v1/listen?' + params.toString();
}

function preferredRecorderMimeType() {
  const choices = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ];
  return choices.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

function mergeCapturedText(current, next) {
  const currentTrimmed = (current || '').trim();
  const nextTrimmed = (next || '').trim();
  if (!currentTrimmed) return nextTrimmed;
  if (!nextTrimmed) return currentTrimmed;

  const currentNorm = normalizeMessageText(currentTrimmed);
  const nextNorm = normalizeMessageText(nextTrimmed);
  if (currentNorm === nextNorm) return currentTrimmed;
  if (currentNorm.includes(nextNorm)) return currentTrimmed;
  if (nextNorm.includes(currentNorm)) return nextTrimmed;
  return currentTrimmed + ' ' + nextTrimmed;
}

function resetTabTranscriptBuffer() {
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = null;
  tabFinalText = '';
  tabLiveText = '';
}

function queueTabTranscript(text) {
  tabFinalText = mergeCapturedText(tabFinalText, text);
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = setTimeout(() => flushTabTranscript(), TAB_UTTERANCE_SILENCE_MS);
}

async function flushTabTranscript() {
  if (tabFinalFlushTimer) clearTimeout(tabFinalFlushTimer);
  tabFinalFlushTimer = null;

  const text = normalizeAppSecTerms(tabFinalText);
  tabFinalText = '';
  if (!text) return;

  const t0 = performance.now();
  const direction = tabCaptureDirection === 'outgoing' ? 'outgoing' : 'incoming';
  const fromLang = direction === 'outgoing'
    ? (currentSettings.my_language || 'ru')
    : (currentSettings.their_language || 'en');
  const toLang = direction === 'outgoing'
    ? (currentSettings.their_language || 'en')
    : (currentSettings.my_language || 'ru');
  processLine('\uD83C\uDFA4 [' + direction + '] ' + text);
  if (transcriptOnlyMode) {
    flushPending();
    processLine('\u23F1  stt=0ms trl=0ms tts=0ms');
    return;
  }
  try {
    const resp = await fetch('/api/translate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        from: fromLang,
        to: toLang
      })
    });
    const result = await resp.json();
    const trlMs = Math.round(performance.now() - t0);
    if (result.error) {
      console.warn('[TAB] translate error:', result.error);
      showToast('Incoming translation failed');
      return;
    }
    if (!result.translation) {
      showToast('Incoming translation is empty');
      return;
    }
    processLine('\uD83C\uDF10 [' + direction + '] ' + result.translation);
    processLine('\u23F1  stt=0ms trl=' + trlMs + 'ms tts=0ms');
  } catch(err) {
    console.error('[TAB] translate fetch failed:', err);
    showToast('Incoming translation failed');
  }
}

function defaultMonitorCaptureDirection() {
  return 'incoming';
}

async function startTabCapture(direction = 'incoming') {
  if (tabCaptureActive) return true;
  if (tabCaptureStarting) return false;
  const key = currentSettings.deepgram_api_key;
  if (!key) { showToast('Set Deepgram API key in Settings first'); return false; }
  tabCaptureDirection = direction === 'outgoing' ? 'outgoing' : 'incoming';
  setTabCaptureStarting(true);

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast('Monitor audio capture is not supported in this browser');
      setTabCaptureStarting(false);
      return false;
    }

    showToast('Select the tab, window, or screen that is playing audio');
    const displayOptions = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      systemAudio: 'include',
      windowAudio: 'system',
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
      preferCurrentTab: false
    };
    tabStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    // Keep the video track alive. On Chrome/Windows stopping it can terminate
    // the whole display-capture stream, including the audio track.
    const audioTracks = tabStream.getAudioTracks();
    if (audioTracks.length === 0) {
      showToast('No shared audio. Reopen Monitor and enable tab/screen audio sharing');
      tabStream.getTracks().forEach(t => t.stop());
      tabStream = null;
      setTabCaptureStarting(false);
      return false;
    }
  } catch(e) {
    console.warn('[TAB] system audio capture failed:', e);
    showToast(e && e.name === 'NotAllowedError' ? 'Monitor audio cancelled' : 'Monitor audio capture failed');
    setTabCaptureStarting(false);
    return false;
  }

  const sourceLanguage = tabCaptureDirection === 'outgoing'
    ? (currentSettings.my_language || 'ru')
    : (currentSettings.their_language || 'en');
  const url = deepgramListenUrl(sourceLanguage);
  tabDgSocket = new WebSocket(url, ['token', key]);

  return new Promise(resolve => {
    let settled = false;
    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimeout);
      setTabCaptureStarting(false);
      if (message) showToast(message);
      if (!ok) {
        if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
        if (tabDgSocket && tabDgSocket.readyState < WebSocket.CLOSING) tabDgSocket.close();
        if (tabStream) tabStream.getTracks().forEach(t => t.stop());
        tabRecorder = null;
        tabDgSocket = null;
        tabStream = null;
        resetTabTranscriptBuffer();
        setTabCaptureActive(false);
        tabCaptureDirection = 'incoming';
        void syncEngineState();
      }
      resolve(ok);
    };

    const openTimeout = setTimeout(() => {
      finish(false, 'Deepgram monitor connection timed out');
    }, 8000);

    tabDgSocket.onopen = () => {
      try {
        const mimeType = preferredRecorderMimeType();
        tabRecorder = mimeType ? new MediaRecorder(tabStream, { mimeType }) : new MediaRecorder(tabStream);
        tabRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && tabDgSocket && tabDgSocket.readyState === WebSocket.OPEN) {
            tabDgSocket.send(e.data);
          }
        };
        tabRecorder.onerror = () => finish(false, 'Browser audio recorder failed');
        tabStream.getAudioTracks()[0].onmute = () => showToast('Monitor audio track is muted');
        tabStream.getAudioTracks()[0].onunmute = () => showToast('Monitor audio detected');
        tabRecorder.start(250);
        setTabCaptureActive(true);
        void syncMonitorAudioMode();
        void syncEngineState();
        finish(true, tabCaptureDirection === 'outgoing'
          ? 'Monitor capture ON: translating your audio source'
          : 'Monitor capture ON: translating incoming audio');
      } catch (err) {
        console.warn('[TAB] MediaRecorder failed:', err);
        finish(false, 'Browser audio recorder failed');
      }
    };

    tabDgSocket.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'Results') return;
        const alt = msg.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;
        const text = alt.transcript.trim();
        if (!text) return;
        tabLiveText = mergeCapturedText(tabLiveText, text);

        if (msg.is_final) {
          queueTabTranscript(tabLiveText || text);
          tabLiveText = '';
        }
      } catch(err) { console.warn('Tab STT parse error:', err); }
    };

    tabDgSocket.onerror = () => {
      if (!tabCaptureActive) finish(false, 'Deepgram monitor connection failed');
      else showToast('Deepgram monitor connection error');
    };
    tabDgSocket.onclose = () => {
      if (!settled) finish(false, 'Deepgram monitor connection closed');
      else if (tabCaptureActive) stopTabCapture();
    };

    // Stop if user stops sharing the tab
    tabStream.getAudioTracks()[0].onended = () => stopTabCapture();
  });
}

function stopTabCapture(showMessage = true) {
  flushTabTranscript();
  setTabCaptureStarting(false);
  if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
  if (tabDgSocket && tabDgSocket.readyState === WebSocket.OPEN) {
    tabDgSocket.send(new Uint8Array(0)); // close signal
    tabDgSocket.close();
  }
  if (tabStream) tabStream.getTracks().forEach(t => t.stop());
  tabRecorder = null;
  tabDgSocket = null;
  tabStream = null;
  resetTabTranscriptBuffer();
  monitorStartedTabCapture = false;
  setTabCaptureActive(false);
  tabCaptureDirection = 'incoming';
  setMonitorEnabled(false);
  syncMonitorAudioMode();
  void syncEngineState();
  if (showMessage) showToast('Monitor audio capture OFF');
}

// ===== Engine start/stop =====
let engineRunning = false;
let engineToggleBusy = false;
let pipelineRestartBusy = false;
let engineStartedAt = 0;
let timerPaused = true;
let timerPausedAt = 0;
let timerOffset = 0;

async function toggleEngine() {
  if (engineToggleBusy) return;
  engineToggleBusy = true;
  const btn = document.getElementById('btn-engine');
  const icon = document.getElementById('engine-icon');
  const text = document.getElementById('engine-toggle-text');
  if (btn) btn.disabled = true;

  try {
    const backendState = await syncEngineState();
    if (backendState === 'running' || backendState === 'starting' || tabCaptureActive) {
      if (Date.now() - engineStartedAt < ENGINE_STOP_GRACE_MS) {
        showToast('Engine is starting. Wait a few seconds before stopping.');
        return;
      }
      if (tabCaptureActive) stopTabCapture(false);
      monitorStartedTabCapture = false;
      monitorStartedEngine = false;
      setMonitorEnabled(false);
      await sendCmd('stop');
      await fetch('/api/calls/end', { method: 'POST' });
      await sleep(400);
      await syncEngineState();
      showToast('Engine stopped');
      return;
    }

    const forcedStartCmd = monitorStartCommandOverride;
    monitorStartCommandOverride = '';
    const startCmd = forcedStartCmd || getEngineStartCommand();
    if (!startCmd) {
      await syncEngineState();
      showToast(tabCaptureActive ? 'Monitor is already capturing browser sound' : getEngineStartBlockedMessage());
      return;
    }

    btn.className = 'btn btn-engine stopped';
    text.textContent = 'Starting...';
    icon.innerHTML = '&#8987;';
    setEnginePill('restarting', 'Starting...');

    if (startCmd === 'start_incoming' || startCmd === 'start') {
      await prepareMonitorEngineStart(startCmd);
    }

    if (!(await preflightStartChecks())) {
      await syncEngineState();
      return;
    }

    await saveSettings();

    // New session by default; resumed history keeps its call_id and visible transcript.
    if (resumedCallId) {
      const resp = await fetch('/api/calls/' + resumedCallId + '/resume', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to resume call');
      pending = { direction: null, transcript: null, translation: null };
      recentRenderedMessages = [];
      lastSuggestionFingerprint = '';
    } else {
      const resp = await fetch('/api/calls/new-session', { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to start new call');
      activeCallId = data.call_id || null;
      resumedCallId = null;
      resumedCallLoaded = false;
      clearAll();
    }
    // Reconnect SSE so it doesn't replay old lines
    if (evtSource) { evtSource.close(); }
    connectSSE();

    browserMonitorPlaybackSynced = null;
    await syncMonitorAudioMode();
    const resp = await sendCmd(startCmd);
    if ((resp.status || '').startsWith('error:')) {
      throw new Error(resp.status);
    }
    engineStartedAt = Date.now();
    await sleep(1200);

    const finalState = await syncEngineState();
    if (finalState === 'running' || finalState === 'starting') {
      showToast('Engine started');
      if (startCmd === 'start_outgoing' && !muteState.incoming) {
        setTimeout(() => showToast('Use Monitor for browser sound'), 1100);
      }
    } else {
      showToast('Start request sent');
    }
  } catch (e) {
    await syncEngineState();
    showToast('Engine error');
    console.error('toggleEngine failed:', e);
  } finally {
    engineToggleBusy = false;
    if (btn) btn.disabled = false;
  }
}

function getEngineStartCommand() {
  const pipelines = [];
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  const callPlayback = document.getElementById('cfg-call-input')?.value || 'default';
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';

  const canCaptureOutgoing = isUsableInputDevice(micDevice, true);
  const canPlayOutgoing = isUsableOutputDevice(callPlayback, true);
  if (!muteState.outgoing && canCaptureOutgoing && canPlayOutgoing) {
    pipelines.push('outgoing');
  }

  const canCaptureConfiguredIncoming = isUsableInputDevice(callCapture, false) || isUsableLoopbackDevice(callCapture);
  const canCaptureMonitorIncoming = monitorEnabled && isUsableLoopbackDevice(SYSTEM_LOOPBACK_DEVICE);
  const canCaptureIncoming = canCaptureConfiguredIncoming || canCaptureMonitorIncoming;
  if (!muteState.incoming && !tabCaptureActive && canCaptureIncoming) {
    pipelines.push('incoming');
  }

  if (pipelines.length === 2) return 'start';
  if (pipelines[0] === 'outgoing') return 'start_outgoing';
  if (pipelines[0] === 'incoming') return 'start_incoming';
  return '';
}

function shouldRestartPipelinesAfterMuteChange(previousStartCmd, nextStartCmd) {
  if (!engineRunning || engineToggleBusy || pipelineRestartBusy || tabCaptureActive) return false;
  return previousStartCmd !== nextStartCmd;
}

async function waitForPipelineStop() {
  for (let attempt = 0; attempt < PIPELINE_RESTART_STOP_POLL_LIMIT; attempt += 1) {
    const data = await sendCmd('status');
    const state = normalizeEngineStatus(data.status || '');
    if (state === 'idle' || state === 'crashed' || state === 'unknown') return state;
    await sleep(PIPELINE_RESTART_STOP_POLL_DELAY_MS);
  }

  const data = await sendCmd('status');
  return normalizeEngineStatus(data.status || '');
}

async function stopPipelinesForRestart() {
  browserMonitorPlaybackSynced = null;
  await sendCmd('stop');
  await waitForPipelineStop();
}

async function startPipelinesForCurrentSettings(startCmd) {
  if (!startCmd) {
    await syncEngineState();
    return;
  }

  if (startCmd === 'start_incoming' || startCmd === 'start') {
    await prepareMonitorEngineStart(startCmd);
  } else {
    await saveSettings();
  }

  await syncMonitorAudioMode();
  const resp = await sendCmd(startCmd);
  if ((resp.status || '').startsWith('error:')) {
    throw new Error(resp.status);
  }
  await sleep(PIPELINE_RESTART_START_SETTLE_MS);
  await syncEngineState();
}

async function restartPipelinesForCurrentSettings(startCmd) {
  pipelineRestartBusy = true;
  try {
    await stopPipelinesForRestart();
    await startPipelinesForCurrentSettings(startCmd);
  } finally {
    pipelineRestartBusy = false;
  }
}

function isSystemDefaultDevice(name) {
  return String(name || '').trim().toLowerCase() === 'default';
}

function isSystemLoopbackDevice(name) {
  return String(name || '') === SYSTEM_LOOPBACK_DEVICE;
}

function isUsableInputDevice(selection, allowDefault) {
  if (isSystemDefaultDevice(selection)) return Boolean(allowDefault && availableAudioInputs.length > 0);
  return availableAudioInputs.includes(selection);
}

function isUsableOutputDevice(selection, allowDefault) {
  if (isSystemDefaultDevice(selection)) return Boolean(allowDefault && availableAudioOutputs.length > 0);
  return availableAudioOutputs.includes(selection);
}

function isUsableLoopbackDevice(selection) {
  return isSystemLoopbackDevice(selection) && availableAudioOutputs.length > 0;
}

function canUseOutgoingMicrophone() {
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  return isUsableInputDevice(micDevice, true);
}

function updateAudioControlAvailability() {
  const outBtn = document.getElementById('btn-mic-out');
  const outLabel = document.getElementById('mic-out-label');
  if (!outBtn || !outLabel) return;

  const hasMic = canUseOutgoingMicrophone();
  outBtn.classList.toggle('unavailable', !hasMic);
  outBtn.classList.toggle('active', hasMic && !muteState.outgoing);
  outBtn.classList.toggle('muted', hasMic && muteState.outgoing);
  outBtn.setAttribute('aria-disabled', hasMic ? 'false' : 'true');
  outLabel.textContent = hasMic ? 'Mic Out' : 'No Mic';
  outBtn.title = hasMic
    ? 'Mute / Unmute your microphone'
    : 'No physical microphone detected. Mic Out requires a physical input device.';

  const inBtn = document.getElementById('btn-mic-in');
  if (inBtn) {
    inBtn.classList.toggle('active', !muteState.incoming);
    inBtn.classList.toggle('muted', muteState.incoming);
  }
}

function getEngineStartBlockedMessage() {
  const micDevice = document.getElementById('cfg-mic')?.value || 'default';
  const callPlayback = document.getElementById('cfg-call-input')?.value || 'default';
  const callCapture = document.getElementById('cfg-call-output')?.value || 'default';

  if (muteState.outgoing && muteState.incoming) {
    return isSystemLoopbackDevice(callCapture)
      ? 'Mic In is muted. Turn it on to capture system output loopback.'
      : 'Mic Out and Mic In are muted. Use Monitor to capture browser sound.';
  }
  if (!muteState.outgoing && !isUsableInputDevice(micDevice, true)) {
    if (tabCaptureActive && availableAudioOutputs.length > 0) {
      return 'Monitor is already capturing browser sound.';
    }
    return availableAudioOutputs.length > 0
      ? 'No microphone input. Start captures speaker audio through Mic In only.'
      : 'No microphone input. Use Monitor or connect a microphone.';
  }
  if (!muteState.outgoing && !isUsableOutputDevice(callPlayback, true)) {
    return 'No playback output device available.';
  }
  if (!muteState.incoming && isSystemLoopbackDevice(callCapture) && !isUsableLoopbackDevice(callCapture)) {
    return 'No output device available for system output loopback.';
  }
  if (!muteState.incoming && isSystemDefaultDevice(callCapture)) {
    return 'Select a real system/call capture device or use Monitor.';
  }
  if (!muteState.incoming && !isUsableInputDevice(callCapture, false)) {
    return 'System/call capture device is unavailable. Use Monitor for browser sound.';
  }
  return 'No usable audio pipeline selected';
}

async function toggleMute(direction) {
  if (direction === 'outgoing' && !canUseOutgoingMicrophone()) {
    updateAudioControlAvailability();
    showToast('No microphone detected. Use Mic In or Monitor for speaker audio.');
    return;
  }

  await setDirectionMuted(direction, !muteState[direction]);
}

async function setDirectionMuted(direction, muted) {
  const previousStartCmd = getEngineStartCommand();
  muteState[direction] = muted;
  await sendCmd(muted ? 'mute_' + direction : 'unmute_' + direction);
  const btn = document.getElementById(direction === 'outgoing' ? 'btn-mic-out' : 'btn-mic-in');
  if (btn) btn.className = muted ? 'btn muted' : 'btn active';
  updateAudioControlAvailability();
  updateMonitorButton();

  const nextStartCmd = getEngineStartCommand();
  if (!shouldRestartPipelinesAfterMuteChange(previousStartCmd, nextStartCmd)) return;

  try {
    await restartPipelinesForCurrentSettings(nextStartCmd);
  } catch (e) {
    await syncEngineState();
    showToast('Audio route update failed');
    console.error('Failed to restart audio routes after mute change:', e);
  }
}

function clearAll() {
  chat.innerHTML = '';
  chat.appendChild(typingEl);
  stats = { stt: [], trl: [], tts: [], lat: [], count: 0 };
  lastRenderedDirection = null; lastMsgEl = null; lastMsgTime = 0;
  lastRenderedMessage = null; recentRenderedMessages = [];
  pending = { direction: null, transcript: null, translation: null };
  allMessages = []; bookmarkFilterOn = false;
  document.getElementById('btn-bookmarks').classList.remove('on');
  resetSuggestions(true);
  updateStats();
}

// ===== Settings Panel =====
function openSettings() {
  document.getElementById('sp-backdrop').classList.add('open');
  document.getElementById('sp').classList.add('open');
}
function closeSettings() {
  document.getElementById('sp-backdrop').classList.remove('open');
  document.getElementById('sp').classList.remove('open');
}
function toggleSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

// Populate settings form from loaded settings
function populateForm(s) {
  const dg = document.getElementById('cfg-deepgram');
  const gr = document.getElementById('cfg-groq');
  const grBackup = document.getElementById('cfg-groq-backup');
  const aiProvider = document.getElementById('cfg-ai-provider');
  const codexEnabled = document.getElementById('cfg-codex-enabled');
  const codexModel = document.getElementById('cfg-codex-model');
  const or = document.getElementById('cfg-openrouter');
  const gemini = document.getElementById('cfg-gemini');
  const ttsProvider = document.getElementById('cfg-tts-provider');
  if (dg._setRealValue) dg._setRealValue(s.deepgram_api_key || '');
  else dg.value = s.deepgram_api_key || '';
  if (gr._setRealValue) gr._setRealValue(s.groq_api_key || '');
  else gr.value = s.groq_api_key || '';
  if (grBackup?._setRealValue) grBackup._setRealValue(s.backup_groq_api_key || '');
  else if (grBackup) grBackup.value = s.backup_groq_api_key || '';
  if (aiProvider) aiProvider.value = s.ai_provider || 'codex';
  if (codexEnabled) codexEnabled.checked = s.codex_enabled !== false;
  if (codexModel) codexModel.value = s.codex_model || 'gpt-5.4';
  if (or._setRealValue) or._setRealValue(s.openrouter_api_key || '');
  else or.value = s.openrouter_api_key || '';
  const orModel = document.getElementById('cfg-openrouter-model');
  if (orModel) orModel.value = s.openrouter_model || 'openrouter/auto';
  if (gemini?._setRealValue) gemini._setRealValue(s.gemini_api_key || '');
  else if (gemini) gemini.value = s.gemini_api_key || '';
  const geminiModel = document.getElementById('cfg-gemini-model');
  if (geminiModel) geminiModel.value = s.gemini_model || 'gemini-3.5-flash';
  const antigravityUrl = document.getElementById('cfg-antigravity-url');
  if (antigravityUrl) antigravityUrl.value = s.antigravity_chat_url || 'http://127.0.0.1:8045/v1/chat/completions';
  textOnlyMode = !!s.text_only_mode;
  transcriptOnlyMode = !!s.transcript_only_mode || s.translation_enabled === false;
  transcriptHiddenMode = !!s.transcript_hidden_mode;
  if (ttsProvider) ttsProvider.value = s.tts_provider || 'piper';
  if (!s.deepgram_api_key && s._deepgram_from_env) dg.placeholder = 'Set via .env file';
  if (!s.groq_api_key && s._groq_from_env) gr.placeholder = 'Set via .env file';
  if (grBackup && !s.backup_groq_api_key && s._backup_groq_from_env) grBackup.placeholder = 'Set via .env file';
  if (!s.openrouter_api_key && s._openrouter_from_env) or.placeholder = 'Set via .env file';
  if (gemini && !s.gemini_api_key && s._gemini_from_env) gemini.placeholder = 'Set via .env file';
  document.getElementById('cfg-my-lang').value = s.my_language || 'en';
  document.getElementById('cfg-their-lang').value = s.their_language || 'en';
  const aiAnswerLanguage = document.getElementById('cfg-ai-answer-language');
  if (aiAnswerLanguage) aiAnswerLanguage.value = s.ai_answer_language || 'their';
  updateTextOnlyButton();
  updateTranscriptOnlyButton();
  updateTranscriptHiddenMode();
  updateMonitorButton();
  document.getElementById('cfg-endpointing').value = s.endpointing_ms || 700;
  document.getElementById('endpointing-val').textContent = (s.endpointing_ms || 700) + 'ms';
  document.getElementById('cfg-call-input').value = s.meet_output_device || 'default';
  document.getElementById('cfg-call-output').value = s.meet_input_device || 'default';
  currentSettings.ai_resume_prompt = clipPromptText(s.ai_resume_prompt || '');
  currentSettings.ai_vacancy_prompt = clipPromptText(s.ai_vacancy_prompt || '');
  updatePromptButtons();
  // Device dropdowns populated by loadDevices() using currentSettings
  if (Object.keys(allVoices).length > 0) updateVoiceDropdowns();
}

function readForm() {
  return {
    deepgram_api_key: (document.getElementById('cfg-deepgram')._getRealValue || (() => document.getElementById('cfg-deepgram').value))().trim(),
    groq_api_key: (document.getElementById('cfg-groq')._getRealValue || (() => document.getElementById('cfg-groq').value))().trim(),
    backup_groq_api_key: (document.getElementById('cfg-groq-backup')._getRealValue || (() => document.getElementById('cfg-groq-backup').value))().trim(),
    ai_provider: document.getElementById('cfg-ai-provider')?.value || 'codex',
    codex_enabled: document.getElementById('cfg-codex-enabled')?.checked !== false,
    codex_model: (document.getElementById('cfg-codex-model')?.value || 'gpt-5.4').trim(),
    openrouter_api_key: (document.getElementById('cfg-openrouter')._getRealValue || (() => document.getElementById('cfg-openrouter').value))().trim(),
    openrouter_model: (document.getElementById('cfg-openrouter-model')?.value || 'openrouter/auto').trim(),
    gemini_api_key: (document.getElementById('cfg-gemini')._getRealValue || (() => document.getElementById('cfg-gemini').value))().trim(),
    gemini_model: (document.getElementById('cfg-gemini-model')?.value || 'gemini-3.5-flash').trim(),
    antigravity_chat_url: (document.getElementById('cfg-antigravity-url')?.value || 'http://127.0.0.1:8045/v1/chat/completions').trim(),
    ai_resume_prompt: clipPromptText(currentSettings.ai_resume_prompt || ''),
    ai_vacancy_prompt: clipPromptText(currentSettings.ai_vacancy_prompt || ''),
    tts_provider: document.getElementById('cfg-tts-provider')?.value || 'piper',
    my_language: document.getElementById('cfg-my-lang').value,
    their_language: document.getElementById('cfg-their-lang').value,
    ai_answer_language: document.getElementById('cfg-ai-answer-language')?.value || 'their',
    tts_outgoing_voice: document.getElementById('cfg-voice-out').value,
    tts_incoming_voice: document.getElementById('cfg-voice-in').value,
    mic_device: document.getElementById('cfg-mic').value || 'default',
    speaker_device: document.getElementById('cfg-speaker').value || 'default',
    meet_input_device: document.getElementById('cfg-call-output').value || 'default',
    meet_output_device: document.getElementById('cfg-call-input').value || 'default',
    endpointing_ms: parseInt(document.getElementById('cfg-endpointing').value),
    text_only_mode: textOnlyMode,
    transcript_only_mode: transcriptOnlyMode,
    transcript_hidden_mode: transcriptHiddenMode,
    translation_enabled: !transcriptOnlyMode,
  };
}

// Download missing voice model with user confirmation
let downloadingLangs = new Set();

const LANGS_NO_TTS = [];

async function showDownloadPrompt(lang, hintId) {
  const hint = document.getElementById(hintId);
  if (LANGS_NO_TTS.includes(lang)) {
    hint.innerHTML = '<span style="color:var(--yellow)">No TTS voice exists for ' + langName(lang) +
      '. Translation will work but without audio output.</span>';
    return;
  }
  hint.innerHTML = '<button class="sp-download-btn" onclick="downloadDefaultVoice(\'' +
    lang + '\', \'' + hintId + '\')">Download ' + langName(lang) +
    ' default voice &amp; restart engine</button>';
  hint.style.color = '';
}

async function downloadDefaultVoice(lang, hintId) {
  if (downloadingLangs.has(lang)) return;
  downloadingLangs.add(lang);
  const hint = document.getElementById(hintId);
  hint.innerHTML = '<div class="sp-progress"><div class="sp-progress-bar" id="pb-' + lang +
    '"></div><div class="sp-progress-text" id="pt-' + lang + '">Connecting...</div></div>';

  try {
    const resp = await fetch('/api/download-voice', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.progress !== undefined) {
          const bar = document.getElementById('pb-' + lang);
          const txt = document.getElementById('pt-' + lang);
          if (bar) bar.style.width = data.progress + '%';
          if (txt) txt.textContent = data.progress + '% \u2014 ' + data.mb_done + '/' + data.mb_total + ' MB';
        }
        if (data.done) {
          hint.innerHTML = '<span style="color:var(--green)">' + langName(lang) +
            ' voice installed!</span>';
          showToast(langName(lang) + ' voice downloaded');
          await loadVoices();
          await saveAndRestart();
        }
        if (data.error) {
          hint.innerHTML = '<span style="color:var(--red)">' + data.error + '</span>';
        }
      }
    }
  } catch(e) {
    hint.innerHTML = '<span style="color:var(--red)">Download failed: ' + e.message + '</span>';
  }
  downloadingLangs.delete(lang);
}

// Language change → update voice dropdowns
document.getElementById('cfg-my-lang').addEventListener('change', () => {
  updateVoiceDropdowns();
  updateTranscriptOnlyButton();
});
document.getElementById('cfg-their-lang').addEventListener('change', () => {
  updateVoiceDropdowns();
  updateTranscriptOnlyButton();
});
document.getElementById('cfg-tts-provider')?.addEventListener('change', () => {
  if (isBrowserTtsProvider()) void loadBrowserVoices().then(updateVoiceDropdowns);
  else updateVoiceDropdowns();
});

// Endpointing slider live update
document.getElementById('cfg-endpointing').addEventListener('input', function() {
  document.getElementById('endpointing-val').textContent = this.value + 'ms';
});

// Test API key
async function testKey(provider, triggerBtn = null) {
  provider = provider || 'codex';
  const inputIds = {
    deepgram: 'cfg-deepgram',
    groq: 'cfg-groq',
    groq_backup: 'cfg-groq-backup',
    codex: null,
    openrouter: 'cfg-openrouter',
    gemini: 'cfg-gemini',
    auto: null,
  };
  const btnIds = {
    deepgram: 'test-deepgram',
    groq: 'test-groq',
    groq_backup: 'test-groq-backup',
    codex: 'test-codex',
    openrouter: 'test-openrouter',
    gemini: 'test-gemini',
    auto: null,
  };
  const inputId = inputIds[provider];
  const btnId = btnIds[provider];
  const el = inputId ? document.getElementById(inputId) : null;
  const key = el ? (el._getRealValue ? el._getRealValue() : el.value).trim() : '';
  const btn = triggerBtn || (btnId ? document.getElementById(btnId) : null);
  if (!btn) return;

  if (!['codex', 'auto'].includes(provider) && !key) { btn.textContent = 'Empty'; btn.className = 'sp-test-btn fail'; return; }

  const codexModel = (document.getElementById('cfg-codex-model')?.value || 'gpt-5.4').trim();
  const openrouterModel = (document.getElementById('cfg-openrouter-model')?.value || 'openrouter/auto').trim();
  const geminiModel = (document.getElementById('cfg-gemini-model')?.value || 'gemini-3.5-flash').trim();
  const antigravityChatUrl = (document.getElementById('cfg-antigravity-url')?.value || 'http://127.0.0.1:8045/v1/chat/completions').trim();
  const payload = { provider, key };
  if (provider === 'codex') payload.model = codexModel;
  if (provider === 'openrouter') payload.model = openrouterModel;
  if (provider === 'gemini') {
    payload.model = geminiModel;
    payload.antigravity_chat_url = antigravityChatUrl;
  }
  if (provider === 'auto') {
    payload.codex_model = codexModel;
    payload.openrouter_model = openrouterModel;
    payload.gemini_model = geminiModel;
    payload.antigravity_chat_url = antigravityChatUrl;
  }

  btn.textContent = '...';
  btn.className = 'sp-test-btn testing';

  try {
    const r = await fetch('/api/test-key', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    const okText = ['codex', 'auto'].includes(provider) ? '\u2713 Request ok' : '\u2713 Valid';
    btn.textContent = data.valid ? okText : (data.error && data.error.includes('402') ? 'Billing req.' : '\u2717 Failed');
    btn.className = 'sp-test-btn ' + (data.valid ? 'ok' : 'fail');
    showToast(data.valid ? (data.message || providerLabel(provider) + ' request ok') : (data.error || 'Provider test failed'));
  } catch(e) {
    btn.textContent = 'Error';
    btn.className = 'sp-test-btn fail';
    showToast(e.message || 'Provider test failed');
  }

  setTimeout(() => { btn.textContent = 'Test'; btn.className = 'sp-test-btn'; }, 4000);
}

async function switchCodexAccount() {
  const btn = document.getElementById('codex-switch');
  if (!btn) return;
  const oldText = btn.textContent;
  btn.textContent = 'Opening...';
  btn.className = 'sp-test-btn testing';
  try {
    const r = await fetch('/api/codex/device-login', { method: 'POST' });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Failed to open Codex login');
    btn.textContent = 'Opened';
    btn.className = 'sp-test-btn ok';
    showToast(data.message || 'Codex login opened');
    const testBtn = document.getElementById('test-codex');
    if (testBtn) {
      testBtn.textContent = 'Test after login';
      testBtn.className = 'sp-test-btn';
    }
  } catch (e) {
    btn.textContent = 'Error';
    btn.className = 'sp-test-btn fail';
    showToast(e.message || 'Failed to open Codex login');
  }
  setTimeout(() => { btn.textContent = oldText; btn.className = 'sp-test-btn'; }, 5000);
}

// Voice preview — synthesize + play through speakers via engine
async function previewVoice(dir) {
  const btn = document.getElementById('preview-' + dir);
  const voiceSelect = document.getElementById('cfg-voice-' + dir);
  const voice = voiceSelect.value;
  if (!voice) { showToast('No voice selected'); return; }
  // Determine language from direction
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;
  if (isEdgeTtsProvider()) {
    btn.classList.add('loading');
    try {
      await speakWithEdge(edgeVoiceSample(lang), lang, voice, null, true);
    } catch (e) {
      console.warn('Edge voice preview failed:', e);
      showToast(e.message || 'Edge voice preview failed');
    } finally {
      btn.classList.remove('loading');
    }
    return;
  }
  if (isBrowserTtsProvider()) {
    btn.classList.add('loading');
    try {
      await speakWithBrowser(browserVoiceSample(lang), lang, voice, true);
    } catch (e) {
      console.warn('Browser voice preview failed:', e);
      showToast(e.message || 'Browser voice preview failed');
    } finally {
      btn.classList.remove('loading');
    }
    return;
  }
  if (!isVoiceDownloaded(dir)) { showToast('Download the voice first'); return; }
  btn.classList.add('loading');
  try {
    await ensureAudioContext();
    // Drop any stale queued audio so we only play the fresh preview.
    await fetch('/api/poll-audio');

    const r = await fetch('/api/tts-preview', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang, voice })
    });
    const data = await r.json();
    if (data.status && data.status.startsWith('ok')) {
      showToast('Playing preview...');
      let previewItem = null;
      for (let i = 0; i < 80; i++) {
        await sleep(150);
        const poll = await fetch('/api/poll-audio');
        const items = await poll.json();
        previewItem = items.find(item => item.direction === 'preview') || null;
        const rest = items.filter(item => item.direction !== 'preview');
        for (const item of rest) monitorQueue.push(item);
        if (previewItem) break;
      }

      if (!previewItem) {
        showToast('Preview audio not received (check PowerShell log)');
      } else {
        await playAudioItem(previewItem, true);
      }
    } else {
      showToast('Preview failed: ' + (data.status || 'engine not running'));
    }
  } catch(e) {
    showToast('Preview error: engine not running');
  }
  btn.classList.remove('loading');
}

// Load voices into dropdowns
let allVoices = {};
let browserVoicesPromise = null;
let catalogWarningShown = false;
const LANG_NAMES = {
  ar:'Arabic',ca:'Catalan',cs:'Czech',da:'Danish',de:'German',el:'Greek',
  en:'English',es:'Spanish',fa:'Persian',fi:'Finnish',fr:'French',
  hi:'Hindi',hu:'Hungarian',id:'Indonesian',it:'Italian',ja:'Japanese',
  ko:'Korean',lv:'Latvian',nl:'Dutch',no:'Norwegian',pl:'Polish',
  pt:'Portuguese',ro:'Romanian',ru:'Russian',sv:'Swedish',tr:'Turkish',
  uk:'Ukrainian',vi:'Vietnamese',zh:'Chinese'
};
function langName(code) { return LANG_NAMES[code] || code; }

// Re-apply tooltips when my-language changes
document.getElementById('cfg-my-lang')?.addEventListener('change', applyTooltips);

function isBrowserTtsProvider() {
  return (document.getElementById('cfg-tts-provider')?.value || currentSettings.tts_provider || 'piper') === 'browser';
}

function isEdgeTtsProvider() {
  return (document.getElementById('cfg-tts-provider')?.value || currentSettings.tts_provider || 'piper') === 'edge';
}

function isExternalTtsProvider() {
  return isBrowserTtsProvider() || isEdgeTtsProvider();
}

function normalizeBrowserLang(code) {
  const map = { no: 'nb' };
  return (map[code] || code || '').toLowerCase();
}

function browserVoiceMatchesLang(voice, lang) {
  const target = normalizeBrowserLang(lang);
  const actual = String(voice.lang || '').toLowerCase();
  return actual === target || actual.startsWith(target + '-') || target.startsWith(actual + '-');
}

function loadBrowserVoices() {
  if (!('speechSynthesis' in window)) {
    browserVoices = [];
    browserVoicesReady = true;
    return Promise.resolve(browserVoices);
  }
  if (browserVoicesPromise) return browserVoicesPromise;
  browserVoicesPromise = new Promise(resolve => {
    const finish = () => {
      browserVoices = window.speechSynthesis.getVoices() || [];
      browserVoicesReady = true;
      resolve(browserVoices);
    };
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length > 0) {
      finish();
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      browserVoicesPromise = null;
      finish();
      if (isBrowserTtsProvider()) updateVoiceDropdowns();
    };
    setTimeout(finish, 1200);
  });
  return browserVoicesPromise;
}

function browserVoiceSample(lang) {
  const code = normalizeBrowserLang(lang);
  if (code === 'ru') return 'Привет. Это тест более живого голоса браузера.';
  if (code === 'en') return 'Hello. This is a test of the browser voice.';
  if (code === 'uk') return 'Привіт. Це тест голосу браузера.';
  return 'Hello. This is a browser voice test.';
}

function edgeVoiceSample(lang) {
  const code = normalizeBrowserLang(lang);
  if (code === 'ru') return 'Привет. Это тест нейронного голоса Microsoft Edge.';
  if (code === 'en') return 'Hello. This is a test of the Microsoft Edge neural voice.';
  if (code === 'uk') return 'Привіт. Це тест нейронного голосу Microsoft Edge.';
  return 'Hello. This is an Edge neural voice test.';
}

function findBrowserVoice(voiceName, lang) {
  if (!browserVoicesReady) browserVoices = window.speechSynthesis?.getVoices?.() || [];
  const voicesForLang = browserVoices.filter(v => browserVoiceMatchesLang(v, lang));
  return (
    browserVoices.find(v => v.name === voiceName) ||
    voicesForLang.find(v => /natural|online|neural/i.test(v.name)) ||
    voicesForLang[0] ||
    browserVoices.find(v => String(v.lang || '').toLowerCase().startsWith(normalizeBrowserLang(lang))) ||
    null
  );
}

async function speakWithBrowser(text, lang, voiceName, force = false) {
  if (!force && (textOnlyMode || transcriptOnlyMode || !isBrowserTtsProvider())) return;
  if (!('speechSynthesis' in window)) {
    throw new Error('Browser speech synthesis is unavailable');
  }
  await loadBrowserVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = findBrowserVoice(voiceName, lang);
  if (voice) utterance.voice = voice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  browserTtsSpeaking = true;
  return new Promise((resolve, reject) => {
    utterance.onend = () => { browserTtsSpeaking = false; resolve(); };
    utterance.onerror = (e) => {
      browserTtsSpeaking = false;
      reject(new Error(e.error || 'Browser speech failed'));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function speakTranslationWithBrowser(text, direction) {
  if (textOnlyMode || transcriptOnlyMode || !isBrowserTtsProvider() || !text) return;
  const lang = direction === 'outgoing'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = direction === 'outgoing'
    ? document.getElementById('cfg-voice-out')?.value
    : document.getElementById('cfg-voice-in')?.value;
  browserTtsQueue = browserTtsQueue
    .catch(() => {})
    .then(() => withCaptureMuted(direction, () => speakWithBrowser(text, lang, voiceName || '', false)))
    .catch(e => {
      console.warn('Browser TTS failed:', e);
      showToast(e.message || 'Browser TTS failed');
    });
}

async function loadEdgeVoices(lang) {
  const key = normalizeBrowserLang(lang || 'en');
  if (edgeVoicesByLang[key]) return edgeVoicesByLang[key];
  if (edgeVoicesLoading[key]) return edgeVoicesLoading[key];
  edgeVoicesLoading[key] = fetch('/api/edge-voices?lang=' + encodeURIComponent(key))
    .then(async r => {
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'Edge voice list failed');
      edgeVoicesByLang[key] = data;
      return data;
    })
    .finally(() => { delete edgeVoicesLoading[key]; });
  return edgeVoicesLoading[key];
}

function fillEdgeVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  const hintId = selId === 'cfg-voice-out' ? 'voice-hint-out' : 'voice-hint-in';
  const hint = document.getElementById(hintId);
  sel.innerHTML = '';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.textContent = 'Loading Edge voices...';
  sel.appendChild(loadingOpt);
  hint.textContent = 'Loading Microsoft neural voices...';
  hint.style.color = '';

  loadEdgeVoices(lang).then(data => {
    const voices = data.voices || [];
    sel.innerHTML = '';
    if (voices.length === 0) {
      const opt = document.createElement('option');
      opt.value = data.default || '';
      opt.textContent = data.default || 'No Edge voices for ' + langName(lang);
      sel.appendChild(opt);
      hint.textContent = 'No matching Edge voices found. The default Edge voice will be used if available.';
      return;
    }

    const grp = document.createElement('optgroup');
    grp.label = 'Microsoft Neural voices';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.label || v.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
    if (currentVal && voices.some(v => v.name === currentVal)) {
      sel.value = currentVal;
    } else if (data.default && voices.some(v => v.name === data.default)) {
      sel.value = data.default;
    }
    hint.textContent = 'Uses Microsoft Edge neural TTS online. Piper is still available if you switch the engine back.';
  }).catch(e => {
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Edge voices unavailable';
    sel.appendChild(opt);
    hint.textContent = e.message || 'Edge voices unavailable';
    hint.style.color = 'var(--red)';
  });
}

function base64ToBlobUrl(b64, mime) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

async function playCompressedAudio(b64, mime) {
  if (textOnlyMode || transcriptOnlyMode || !b64) return;
  const url = base64ToBlobUrl(b64, mime);
  try {
    const audio = new Audio(url);
    audio.volume = 0.95;
    await audio.play();
    await new Promise(resolve => {
      audio.onended = resolve;
      audio.onerror = resolve;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function withCaptureMuted(direction, fn) {
  // The translated TTS can be picked up by the opposite pipeline too
  // (for example outgoing translation playing through speakers while incoming
  // loopback is active). Temporarily mute both directions and restore only the
  // ones that were not already muted by the user.
  const previous = { ...muteState };
  for (const key of ['outgoing', 'incoming']) {
    if (!previous[key]) {
      try { await sendCmd('mute_' + key); } catch (e) {}
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of ['outgoing', 'incoming']) {
      if (!previous[key]) {
        try { await sendCmd('unmute_' + key); } catch (e) {}
      }
    }
  }
}

async function speakWithEdge(text, lang, voiceName, direction = null, force = false) {
  if (!force && (textOnlyMode || transcriptOnlyMode || !isEdgeTtsProvider())) return;
  const body = { text, lang, voice: voiceName || '' };
  const run = async () => {
    const r = await fetch('/api/edge-tts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Edge TTS failed');
    await playCompressedAudio(data.audio_b64, data.mime);
  };
  if (direction && !force) {
    return withCaptureMuted(direction, run);
  }
  return run();
}

function speakTranslationWithEdge(text, direction) {
  if (textOnlyMode || transcriptOnlyMode || !isEdgeTtsProvider() || !text) return;
  const lang = direction === 'outgoing'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = direction === 'outgoing'
    ? document.getElementById('cfg-voice-out')?.value
    : document.getElementById('cfg-voice-in')?.value;
  browserTtsQueue = browserTtsQueue
    .catch(() => {})
    .then(() => speakWithEdge(text, lang, voiceName || '', direction, false))
    .catch(e => {
      console.warn('Edge TTS failed:', e);
      showToast(e.message || 'Edge TTS failed');
    });
}

function speakTranslationWithExternalTts(text, direction) {
  if (isEdgeTtsProvider()) speakTranslationWithEdge(text, direction);
  else if (isBrowserTtsProvider()) speakTranslationWithBrowser(text, direction);
}

async function loadVoices() {
  try {
    const r = await fetch('/api/voices');
    allVoices = await r.json();
    const langs = Object.keys(allVoices);
    const hasCatalogEntries = langs.some(lang =>
      (allVoices[lang] || []).some(v => !v.downloaded || (v.size_mb || 0) > 0 || (v.quality || '') !== '')
    );
    if (!hasCatalogEntries && !catalogWarningShown) {
      catalogWarningShown = true;
      showToast('Voice catalog offline: showing only local voices');
    }
    ensureSavedVoiceVisible('out');
    ensureSavedVoiceVisible('in');
    updateVoiceDropdowns();
  } catch(e) { console.error('Failed to load voices', e); }
}

function ensureSavedVoiceVisible(dir) {
  if (isExternalTtsProvider()) return;
  const lang = dir === 'out'
    ? (currentSettings.their_language || document.getElementById('cfg-their-lang').value || 'en')
    : (currentSettings.my_language || document.getElementById('cfg-my-lang').value || 'ru');
  const voiceName = dir === 'out'
    ? currentSettings.tts_outgoing_voice
    : currentSettings.tts_incoming_voice;

  if (!voiceName) return;
  if (!allVoices[lang]) allVoices[lang] = [];
  if (allVoices[lang].some(v => v.name === voiceName)) return;

  allVoices[lang].unshift({
    name: voiceName,
    downloaded: true,
    size_mb: 0,
    quality: ''
  });
}

function updateVoiceDropdowns() {
  const theirLang = document.getElementById('cfg-their-lang').value;
  const myLang = document.getElementById('cfg-my-lang').value;

  if (isEdgeTtsProvider()) {
    fillEdgeVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
    fillEdgeVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

    document.getElementById('voice-label-in').textContent =
      langName(myLang) + ' Edge Voice (I hear)';
    document.getElementById('voice-label-out').textContent =
      langName(theirLang) + ' Edge Voice (they hear)';

    updateDlButton('in');
    updateDlButton('out');
    return;
  }

  if (isBrowserTtsProvider()) {
    fillBrowserVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
    fillBrowserVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

    document.getElementById('voice-label-in').textContent =
      langName(myLang) + ' Browser Voice (I hear)';
    document.getElementById('voice-label-out').textContent =
      langName(theirLang) + ' Browser Voice (they hear)';

    updateDlButton('in');
    updateDlButton('out');
    const hintOut = document.getElementById('voice-hint-out');
    const hintIn = document.getElementById('voice-hint-in');
    hintOut.textContent = browserVoicesReady
      ? 'Uses your browser/Windows voices. Microsoft Edge often exposes the most natural online voices.'
      : 'Loading browser voices...';
    hintIn.textContent = hintOut.textContent;
    hintOut.style.color = '';
    hintIn.style.color = '';
    return;
  }

  fillVoiceSelect('cfg-voice-out', theirLang, currentSettings.tts_outgoing_voice);
  fillVoiceSelect('cfg-voice-in', myLang, currentSettings.tts_incoming_voice);

  document.getElementById('voice-label-in').textContent =
    langName(myLang) + ' Voice (I hear)';
  document.getElementById('voice-label-out').textContent =
    langName(theirLang) + ' Voice (they hear)';

  updateDlButton('in');
  updateDlButton('out');

  // Show download prompt if no downloaded voices for this language
  const hintOut = document.getElementById('voice-hint-out');
  const hintIn = document.getElementById('voice-hint-in');
  const voicesOut = allVoices[theirLang] || [];
  const voicesIn = allVoices[myLang] || [];
  const hasDownloadedOut = voicesOut.some(v => v.downloaded);
  const hasDownloadedIn = voicesIn.some(v => v.downloaded);

  if (!hasDownloadedOut) showDownloadPrompt(theirLang, 'voice-hint-out');
  else { hintOut.textContent = ''; hintOut.style.color = ''; }
  if (!hasDownloadedIn) showDownloadPrompt(myLang, 'voice-hint-in');
  else { hintIn.textContent = ''; hintIn.style.color = ''; }
}

function fillBrowserVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '';
  const voices = (browserVoices || []).filter(v => browserVoiceMatchesLang(v, lang));
  const source = voices.length ? voices : (browserVoices || []);
  if (source.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No browser voices found';
    sel.appendChild(opt);
    return;
  }

  const grp = document.createElement('optgroup');
  grp.label = voices.length ? 'Browser voices' : 'All browser voices';
  source
    .slice()
    .sort((a, b) => {
      const aNatural = /natural|online|neural/i.test(a.name) ? 0 : 1;
      const bNatural = /natural|online|neural/i.test(b.name) ? 0 : 1;
      return aNatural - bNatural || a.name.localeCompare(b.name);
    })
    .forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name + (v.lang ? ' — ' + v.lang : '');
      grp.appendChild(opt);
    });
  sel.appendChild(grp);

  if (currentVal && source.some(v => v.name === currentVal)) {
    sel.value = currentVal;
  } else {
    const preferred = source.find(v => /natural|online|neural/i.test(v.name)) || source[0];
    if (preferred) sel.value = preferred.name;
  }
}

function fillVoiceSelect(selId, lang, currentVal) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '';
  const voices = allVoices[lang] || [];
  if (voices.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'No voices for ' + langName(lang);
    sel.appendChild(opt);
    return;
  }
  const downloaded = voices.filter(v => v.downloaded);
  const available = voices.filter(v => !v.downloaded);

  if (downloaded.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Downloaded';
    downloaded.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name.replace(/-/g, ' ');
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  if (available.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Available (' + available.length + ')';
    available.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name.replace(/-/g, ' ') + ' \u2014 ' + v.size_mb + ' MB';
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  if (currentVal && voices.some(v => v.name === currentVal)) sel.value = currentVal;
}

function isVoiceDownloaded(dir) {
  if (isExternalTtsProvider()) return true;
  const sel = document.getElementById('cfg-voice-' + dir);
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;
  const voices = allVoices[lang] || [];
  const voice = voices.find(v => v.name === sel.value);
  return voice ? voice.downloaded : true;
}

function updateDlButton(dir) {
  const btn = document.getElementById('dl-voice-' + dir);
  const sel = document.getElementById('cfg-voice-' + dir);
  if (isExternalTtsProvider()) {
    btn.classList.add('hidden');
    return;
  }
  if (!sel.value || isVoiceDownloaded(dir)) {
    btn.classList.add('hidden');
  } else {
    btn.classList.remove('hidden');
  }
}

// Update download button when voice selection changes
document.getElementById('cfg-voice-in').addEventListener('change', () => updateDlButton('in'));
document.getElementById('cfg-voice-out').addEventListener('change', () => updateDlButton('out'));

async function downloadSelectedVoice(dir) {
  const sel = document.getElementById('cfg-voice-' + dir);
  const btn = document.getElementById('dl-voice-' + dir);
  const hint = document.getElementById('voice-hint-' + dir);
  const voice = sel.value;
  const lang = dir === 'out'
    ? document.getElementById('cfg-their-lang').value
    : document.getElementById('cfg-my-lang').value;

  if (!voice) return;
  btn.classList.add('loading');
  hint.innerHTML = '<div class="sp-progress"><div class="sp-progress-bar" id="pb-dl-' + dir +
    '"></div><div class="sp-progress-text" id="pt-dl-' + dir + '">Connecting...</div></div>';

  try {
    const resp = await fetch('/api/download-voice', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang, voice })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.progress !== undefined) {
          const bar = document.getElementById('pb-dl-' + dir);
          const txt = document.getElementById('pt-dl-' + dir);
          if (bar) bar.style.width = data.progress + '%';
          if (txt) txt.textContent = data.progress + '% \u2014 ' + data.mb_done + '/' + data.mb_total + ' MB';
        }
        if (data.done) {
          hint.innerHTML = '<span style="color:var(--green)">Downloaded!</span>';
          setTimeout(() => { hint.textContent = ''; }, 3000);
          await loadVoices();
          sel.value = voice;
          updateDlButton(dir);
        }
        if (data.error) {
          hint.innerHTML = '<span style="color:var(--red)">' + data.error + '</span>';
        }
      }
    }
  } catch(e) {
    hint.innerHTML = '<span style="color:var(--red)">Download failed: ' + e.message + '</span>';
  }
  btn.classList.remove('loading');
}

const PREFERRED_CALL_CAPTURE_DEVICES = [
  'CABLE-A Output (VB-Audio Cable A)',
  'CABLE Output (VB-Audio Virtual Cable)'
];
const PREFERRED_CALL_PLAYBACK_DEVICES = [
  'CABLE-B Input (VB-Audio Cable B)',
  'CABLE Input (VB-Audio Virtual Cable)'
];

function normalizeDeviceName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickPreferredDevice(devices, current, preferred) {
  if (current && current !== 'default' && devices.includes(current)) return current;
  return pickPreferredDeviceOnly(devices, preferred) || (current && current === 'default' ? current : 'default');
}

function pickPreferredDeviceOnly(devices, preferred) {
  const normalizedDevices = devices.map(device => ({
    raw: device,
    normalized: normalizeDeviceName(device)
  }));

  for (const wanted of preferred) {
    const normalizedWanted = normalizeDeviceName(wanted);
    const exact = normalizedDevices.find(device => device.normalized === normalizedWanted);
    if (exact) return exact.raw;
  }

  for (const wanted of preferred) {
    const normalizedWanted = normalizeDeviceName(wanted);
    const partial = normalizedDevices.find(device =>
      device.normalized.includes(normalizedWanted) || normalizedWanted.includes(device.normalized)
    );
    if (partial) return partial.raw;
  }

  return '';
}

function pickAvailableOutputDevice(devices, current) {
  if (!current || isSystemDefaultDevice(current)) return 'default';
  return devices.includes(current) ? current : 'default';
}

function pickCallCaptureDevice(inputDevices, outputDevices, current) {
  if (isSystemLoopbackDevice(current) && outputDevices.length > 0) return SYSTEM_LOOPBACK_DEVICE;

  const preferred = pickPreferredDeviceOnly(inputDevices, PREFERRED_CALL_CAPTURE_DEVICES);
  if (preferred) return preferred;

  if (outputDevices.length > 0) return SYSTEM_LOOPBACK_DEVICE;
  if (current && current !== 'default' && inputDevices.includes(current)) return current;
  return 'default';
}

// Load audio devices into select dropdowns
async function loadDevices() {
  try {
    const r = await fetch('/api/devices');
    const data = await r.json();
    const inputDevs = (data.input || []).filter(d => !isSystemDefaultDevice(d));
    const outputDevs = (data.output || []).filter(d => !isSystemDefaultDevice(d));
    availableAudioInputs = inputDevs;
    availableAudioOutputs = outputDevs;

    function fillSelect(id, devices, current, options = {}) {
      const sel = document.getElementById(id);
      sel.innerHTML = '';
      // The UI owns the single system-default option; backend lists only real devices.
      const def = document.createElement('option');
      def.value = 'default'; def.textContent = 'System default';
      sel.appendChild(def);
      if (options.includeLoopback) {
        const loopback = document.createElement('option');
        loopback.value = SYSTEM_LOOPBACK_DEVICE;
        loopback.textContent = SYSTEM_LOOPBACK_LABEL;
        sel.appendChild(loopback);
      }
      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        sel.appendChild(opt);
      });
      if (current && current !== 'default') {
        // Add current value if not in list (e.g. device unplugged)
        const knownSpecial = options.includeLoopback && isSystemLoopbackDevice(current);
        if (!devices.includes(current) && !knownSpecial) {
          const opt = document.createElement('option');
          opt.value = current; opt.textContent = current + ' (saved)';
          sel.appendChild(opt);
        }
        sel.value = current;
      }
    }

    const callCaptureDevice = pickCallCaptureDevice(
      inputDevs,
      outputDevs,
      currentSettings.meet_input_device
    );
    const callPlaybackDevice = pickPreferredDevice(
      outputDevs,
      currentSettings.meet_output_device,
      PREFERRED_CALL_PLAYBACK_DEVICES
    );
    const speakerDevice = pickAvailableOutputDevice(outputDevs, currentSettings.speaker_device);
    currentSettings.meet_input_device = callCaptureDevice;
    currentSettings.meet_output_device = callPlaybackDevice;
    currentSettings.speaker_device = speakerDevice;

    fillSelect('cfg-mic', inputDevs, currentSettings.mic_device);
    fillSelect('cfg-speaker', outputDevs, speakerDevice);
    fillSelect('cfg-call-input', outputDevs, callPlaybackDevice);
    fillSelect('cfg-call-output', inputDevs, callCaptureDevice, { includeLoopback: outputDevs.length > 0 });
    updateAudioControlAvailability();
    updateMonitorButton();
  } catch(e) { console.error('Failed to load devices', e); }
}

function deviceSignature(inputs, outputs) {
  return JSON.stringify({
    input: [...inputs].sort(),
    output: [...outputs].sort()
  });
}

function isIncomingLoopbackRouteSelected() {
  const callCapture = document.getElementById('cfg-call-output')?.value || currentSettings.meet_input_device || 'default';
  return Boolean(!muteState.incoming && !tabCaptureActive && isSystemLoopbackDevice(callCapture));
}

async function recoverAudioRouteAfterHotplug(reason) {
  if (!engineRunning || tabCaptureActive || !isIncomingLoopbackRouteSelected()) return;
  if (availableAudioOutputs.length === 0) {
    await stopPipelinesForRestart();
    await syncEngineState();
    showToast('Audio output device lost. Connect headphones/speakers or use Monitor.');
    return;
  }

  const startCmd = getEngineStartCommand();
  if (!startCmd) {
    await stopPipelinesForRestart();
    await syncEngineState();
    showToast('Audio route unavailable after device change.');
    return;
  }

  await saveSettings();
  await restartPipelinesForCurrentSettings(startCmd);
  showToast(reason === 'native'
    ? 'Audio device recovered; capture restarted'
    : 'Audio device changed; capture restarted');
}

async function checkAudioDeviceHotplug(reason = 'poll') {
  if (reason === 'poll' && !engineRunning && !tabCaptureActive) return;
  if (audioHotplugBusy) return;
  audioHotplugBusy = true;
  try {
    const previousSignature = audioDeviceSignature || deviceSignature(availableAudioInputs, availableAudioOutputs);
    await loadDevices();
    const nextSignature = deviceSignature(availableAudioInputs, availableAudioOutputs);
    if (!audioDeviceSignature) {
      audioDeviceSignature = nextSignature;
      return;
    }
    if (reason !== 'native' && previousSignature === nextSignature) return;
    audioDeviceSignature = nextSignature;
    await recoverAudioRouteAfterHotplug(reason);
  } catch (e) {
    console.warn('Audio hotplug recovery failed:', e);
    showToast('Audio device recovery failed');
  } finally {
    audioHotplugBusy = false;
  }
}

function startAudioDeviceWatcher() {
  audioDeviceSignature = deviceSignature(availableAudioInputs, availableAudioOutputs);
  if (!audioDeviceWatchTimer) {
    audioDeviceWatchTimer = setInterval(
      () => checkAudioDeviceHotplug('poll'),
      AUDIO_DEVICE_WATCH_INTERVAL_MS
    );
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => checkAudioDeviceHotplug('devicechange'));
  }
}

// Load settings from server
async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    currentSettings = await r.json();
    populateForm(currentSettings);
    ensureSavedVoiceVisible('out');
    ensureSavedVoiceVisible('in');
    if (Object.keys(allVoices).length > 0) updateVoiceDropdowns();
  } catch(e) { console.error('Failed to load settings', e); }
}

// Save settings to server
async function saveSettings() {
  const settings = readForm();
  await saveSettingsPayload(settings);
}

// ===== Engine Restart =====
function setEnginePill(state, text) {
  const pill = document.getElementById('engine-pill');
  pill.className = 'engine-pill' + (state === 'running' ? '' : ' ' + state);
  document.getElementById('engine-label').textContent = text;
}

async function saveAndRestart() {
  const btn = document.getElementById('restart-btn');
  const txt = document.getElementById('restart-text');
  const bar = document.getElementById('restart-progress');
  let restartStartCmd = '';

  btn.classList.add('restarting');
  btn.classList.remove('success', 'error');

  try {
    const backendState = await syncEngineState();
    const shouldResumePipelines = backendState === 'running' || backendState === 'starting';

    // Stage 1: Save
    txt.textContent = 'Saving settings...';
    bar.style.width = '15%';
    setEnginePill('restarting', 'Saving...');
    await saveSettings();
    restartStartCmd = shouldResumePipelines ? getEngineStartCommand() : '';
    await sleep(300);

    // Stage 2: Restart
    txt.textContent = 'Restarting engine...';
    bar.style.width = '35%';
    setEnginePill('restarting', 'Restarting...');
    await fetch('/api/engine/restart', { method: 'POST' });
    browserMonitorPlaybackSynced = null;
    await sleep(500);

    // Stage 3: Wait for models to load
    txt.textContent = 'Loading models...';
    bar.style.width = '60%';
    setEnginePill('restarting', 'Loading...');

    // Poll health
    let attempts = 0;
    while (attempts < 60) {
      await sleep(1000);
      attempts++;
      bar.style.width = Math.min(60 + attempts, 95) + '%';
      try {
        const r = await fetch('/health');
        if (r.ok) break;
      } catch(e) {}
    }

    // Stage 4: Resume pipelines when the engine was running before restart.
    txt.textContent = restartStartCmd ? 'Starting pipelines...' : 'Finalizing...';
    bar.style.width = '95%';
    await syncEngineState();
    if (restartStartCmd) {
      await startPipelinesForCurrentSettings(restartStartCmd);
      engineStartedAt = Date.now();
    } else {
      await sleep(1000);
      await syncEngineState();
    }

    // Done!
    bar.style.width = '100%';
    btn.classList.remove('restarting');
    btn.classList.add('success');
    txt.innerHTML = '&#10003; Ready!';
    await syncEngineState();
    showToast(restartStartCmd ? 'Engine restarted and capture resumed' : 'Engine restarted');

    await sleep(2500);
    btn.classList.remove('success');
    txt.textContent = 'Save & Restart Engine';
    bar.style.width = '0%';

  } catch(e) {
    btn.classList.remove('restarting');
    btn.classList.add('error');
    txt.textContent = 'Error: ' + (e.message || 'restart failed');
    setEnginePill('stopped', 'Error');

    await sleep(3000);
    btn.classList.remove('error');
    txt.textContent = 'Save & Restart Engine';
    bar.style.width = '0%';
  }
}

// ===== Init =====
async function waitForEngine() {
  const overlay = document.getElementById('overlay');
  const text = document.getElementById('overlay-text');
  const spinner = document.getElementById('spinner');
  while (true) {
    try {
      const r = await fetch('/health');
      if (r.ok) {
        text.className = 'ready';
        text.textContent = 'Engine ready';
        spinner.style.display = 'none';
        sessionStart = Date.now();
        await syncEngineState();
        await sleep(600);
        overlay.className = 'hidden';
        engineReady = true;
        maybeAutoStartResumedCall();
        return;
      }
    } catch(e) {}
    await sleep(500);
  }
}

// Boot sequence
(async function boot() {
  // Load settings + voices + devices in parallel
  await Promise.all([loadSettings(), loadVoices(), loadDevices()]);
  await loadDevices();
  updateVoiceDropdowns();
  applyTooltips();
  ['cfg-mic', 'cfg-call-output', 'cfg-call-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateAudioControlAvailability);
  });
  document.getElementById('prompt-text')?.addEventListener('input', updatePromptCounter);
  updatePromptButtons();
  updateAudioControlAvailability();
  updateMonitorButton();
  startAudioDeviceWatcher();
  await loadResumedCallFromUrl();

  // Auto-open settings if no API keys configured
  if (!currentSettings.deepgram_api_key && !currentSettings.groq_api_key && !currentSettings.backup_groq_api_key) {
    openSettings();
  }
  aiSuggestionsOpen = true;
  document.getElementById('btn-suggestions').classList.add('on');
  bootReady = true;
  maybeAutoStartResumedCall();
})();

waitForEngine();

let evtSource = null;
function connectSSE(replay) {
  if (evtSource) evtSource.close();
  const url = replay ? '/stream?replay=1' : '/stream';
  evtSource = new EventSource(url);
  evtSource.onmessage = (e) => processLine(e.data);
  evtSource.onerror = () => { statusEl.textContent = 'Disconnected'; statusEl.className = 'disconnected'; };
  evtSource.onopen = () => { statusEl.textContent = 'Connected'; statusEl.className = ''; };
}
connectSSE();
