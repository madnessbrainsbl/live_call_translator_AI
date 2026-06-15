/// Speech-to-text via Deepgram Nova-3 streaming WebSocket API.
///
/// Sends raw PCM audio over a persistent WebSocket connection.
/// Deepgram handles VAD/endpointing internally and returns `speech_final`
/// events when an utterance is complete.
use std::io::ErrorKind;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use log::{debug, info, warn};
use serde::Deserialize;
use tungstenite::client::IntoClientRequest;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};

type DeepgramWebSocket = WebSocket<MaybeTlsStream<std::net::TcpStream>>;

// ---------------------------------------------------------------------------
// DeepgramStt — config holder, creates sessions
// ---------------------------------------------------------------------------

pub struct DeepgramStt {
    api_key: String,
    language: String,
    /// Milliseconds of silence before Deepgram fires speech_final (endpointing).
    endpointing_ms: u32,
}

impl DeepgramStt {
    pub fn new(api_key: String, language: String, endpointing_ms: u32) -> Self {
        let requested_language = deepgram_language_code(&language);
        let language_mode = std::env::var("TRANSLATOR_DEEPGRAM_LANGUAGE_MODE")
            .unwrap_or_else(|_| "configured".into());
        let language = if language_mode.eq_ignore_ascii_case("multi")
            && nova3_multilingual_supports(&requested_language)
        {
            "multi".to_string()
        } else {
            requested_language
        };
        Self {
            api_key,
            language,
            endpointing_ms,
        }
    }

    /// Open a WebSocket session to Deepgram.
    /// `sample_rate` is the rate of audio you'll send (after downsampling).
    pub fn create_session(&self, sample_rate: u32) -> Result<DeepgramSession> {
        let base_url = format!(
            "wss://api.deepgram.com/v1/listen\
             ?model=nova-3\
             &language={}\
             &encoding=linear16\
             &sample_rate={}\
             &channels=1\
             &interim_results=true\
             &smart_format=true\
             &endpointing={}",
            self.language, sample_rate, self.endpointing_ms
        );
        let keyterm_query = deepgram_keyterm_query(&self.language);
        let url = format!("{}{}", base_url, keyterm_query);
        let keyterms_enabled = !keyterm_query.is_empty();

        info!(
            "Connecting to Deepgram (lang={}, {}Hz, endpointing={}ms, keyterms={})...",
            self.language,
            sample_rate,
            self.endpointing_ms,
            if keyterms_enabled { "on" } else { "off" }
        );

        let ws = match connect_deepgram(&url, &self.api_key) {
            Ok(ws) => ws,
            Err(error) if keyterms_enabled && is_deepgram_bad_request(&error) => {
                warn!("Deepgram rejected keyterms with HTTP 400; retrying without keyterms");
                connect_deepgram(&base_url, &self.api_key)
                    .context("Failed to connect to Deepgram without keyterms")?
            }
            Err(error) => return Err(error),
        };

        info!("Deepgram session connected");
        Ok(DeepgramSession {
            ws,
            audio_sent_secs: 0.0,
            last_send_time: Instant::now(),
            last_keepalive_time: Instant::now(),
            sample_rate,
            final_transcript: String::new(),
            latest_interim: String::new(),
        })
    }
}

fn connect_deepgram(url: &str, api_key: &str) -> Result<DeepgramWebSocket> {
    // Build request via into_client_request() so tungstenite adds proper
    // WebSocket handshake headers, then inject the Authorization header on top.
    let mut request = url
        .into_client_request()
        .context("Failed to build Deepgram request")?;
    request.headers_mut().insert(
        "Authorization",
        format!("Token {}", api_key)
            .parse()
            .context("Invalid API key header value")?,
    );

    let (mut ws, _) = connect(request).context("Failed to connect to Deepgram WebSocket")?;

    // Non-blocking so we can poll without blocking the audio loop.
    set_nonblocking(&mut ws)?;
    Ok(ws)
}

fn is_deepgram_bad_request(error: &anyhow::Error) -> bool {
    let message = format!("{:#}", error).to_lowercase();
    message.contains("http error: 400") || message.contains("400 bad request")
}

fn deepgram_language_code(language: &str) -> String {
    match language {
        "pt" => "pt-BR",
        "no" => "nb",
        code => code,
    }
    .to_string()
}

fn nova3_multilingual_supports(language: &str) -> bool {
    let base = language.split('-').next().unwrap_or(language);
    matches!(
        base,
        "en" | "es" | "fr" | "de" | "hi" | "ru" | "pt" | "ja" | "it" | "nl"
    )
}

const DEEPGRAM_KEYTERMS: &[&str] = &[
    "Kubernetes",
    "kubectl",
    "Docker",
    "DevOps",
    "SecOps",
    "DevSecOps",
    "K2",
    "PC/SC",
    "PC/SC reader",
    "card reader",
    "smart card",
    "OWASP",
    "OWASP Top 10",
    "XSS",
    "CSRF",
    "SSRF",
    "RCE",
    "CVE",
    "CVSS",
    "JWT",
    "OAuth",
    "mTLS",
    "TLS",
    "Base64",
    "B64",
    "X.509",
    "certificate",
    "cert",
    "certificate chain",
    "public key",
    "private key",
    "WAF",
    "SAST",
    "DAST",
    "SCA",
    "SBOM",
    "Software Bill of Materials",
    "IDOR",
    "Burp Suite",
    "Burp Suite Professional",
    "OWASP ZAP",
    "OpenVAS",
    "Nuclei",
    "Semgrep",
    "DefectDojo",
    "Trivy",
    "Wazuh",
    "SOC analyst",
    "runbook",
    "bastion",
    "IAM",
    "IAM policies",
    "cluster-admin",
    "node exporter",
    "Grafana",
    "Loki",
    "Vault",
    "HashiCorp Vault",
    "threat modeling",
    "secrets scanning",
    "tcpdump",
    "traceroute",
    "Terraform",
    "GitLab",
    "GitLab Runner",
    "CI/CD",
    "Harbor",
    "Nexus",
    "Jira",
    "Google Cybersecurity",
    "Keycloak",
    "SonarQube",
    "Sonar",
    "Semgrep",
    "OIDC",
    "YubiKey",
    "CryptoPro",
    "CryptoPro CSP",
    "CryptoPro plugin",
    "CSP",
    "SSH",
    "SSH keys",
    "GOST",
    "TOTP",
    "HSM",
    "Rutoken",
    "Google Authenticator",
    "Policy Gateway",
    "policy-server",
    "policy server",
    "Treasure API",
    "Astra Linux",
    "Astra",
    "USB socket",
    "socket",
    "sudo",
    "root",
    "Firecracker",
    "node group",
    "Prometheus",
    "registry",
    "egress",
    "feature toggle",
    "FeatureToggle",
    "TDX",
    "VM",
    "init",
    "polling",
    "downtime",
    "Kafka",
    "Selectel",
    "Global Router",
    "Control Plane",
    "Zero Trust",
    "Active Directory",
    "Microsoft AD",
    "VPN",
    "VLAN",
    "VRF",
    "BGP",
    "OSPF",
    "NAT",
    "DMZ",
    "NGFW",
    "IDS",
    "IPS",
    "NAC",
    "NTA",
    "SOC",
    "L2",
    "L3",
    "L7",
    "fuzzing",
    "SDLC",
    "Dockerfile",
    "namespace",
    "cgroups",
    "kubectl exec",
    "nodeSelector",
    "pod anti-affinity",
];

const KEYTERM_QUERY_PREFIX: &str = "&keyterm=";
const MAX_KEYTERM_QUERY_CHARS: usize = 2_500;

const APPSEC_TERM_REPLACEMENTS: &[(&str, &str)] = &[
    (
        "Security assistant of crypto wallet back end IP before a major release",
        "Security assessment of crypto wallet backend and API before a major release",
    ),
    (
        "security assistant of crypto wallet back end IP before a major release",
        "security assessment of crypto wallet backend and API before a major release",
    ),
    (
        "What a p vulnerabilities will prioritize when testing and on custodian crypto wallet application and why",
        "What API vulnerabilities would you prioritize when testing a non-custodial crypto wallet application and why",
    ),
    (
        "what a p vulnerabilities will prioritize when testing and on custodian crypto wallet application and why",
        "what API vulnerabilities would you prioritize when testing a non-custodial crypto wallet application and why",
    ),
    (
        "Can you describe a real vulnerability you found in web application, opaque, how web impact and how you help me to fix it",
        "Can you describe a real vulnerability you found in a web application or API, how you proved impact, and how you helped to fix it",
    ),
    (
        "can you describe a real vulnerability you found in web application, opaque, how web impact and how you help me to fix it",
        "can you describe a real vulnerability you found in a web application or API, how you proved impact, and how you helped to fix it",
    ),
    (
        "How well do you validate Wizard and Bug bounty report is actually exploitable or just your or just theoretical",
        "How would you validate whether a bug bounty report is actually exploitable or just theoretical",
    ),
    (
        "how well do you validate Wizard and Bug bounty report is actually exploitable or just your or just theoretical",
        "how would you validate whether a bug bounty report is actually exploitable or just theoretical",
    ),
    (
        "How old do you build a security test strategy for web application by Cantera's and strategy for web application by can service and API across pre release and post release stage",
        "How would you build a security testing strategy for web application, backend services, and APIs across pre-release and post-release stages",
    ),
    (
        "how old do you build a security test strategy for web application by Cantera's and strategy for web application by can service and API across pre release and post release stage",
        "how would you build a security testing strategy for web application, backend services, and APIs across pre-release and post-release stages",
    ),
    (
        "Watch security risks remain on the backend side if you wallet itself is not custodian",
        "What security risks remain on the backend side if the wallet itself is non-custodial",
    ),
    (
        "watch security risks remain on the backend side if you wallet itself is not custodian",
        "what security risks remain on the backend side if the wallet itself is non-custodial",
    ),
    (
        "How do you decide whether a bad boundary report is critical heights, medium low severity",
        "How do you decide whether a bug bounty report is critical, high, medium, or low severity",
    ),
    (
        "how do you decide whether a bad boundary report is critical heights, medium low severity",
        "how do you decide whether a bug bounty report is critical, high, medium, or low severity",
    ),
    (
        "In this to gauge whether I love rule, he is blocking leg team users or only malicious traffic",
        "How would you gauge whether a WAF rule is blocking legitimate users or only malicious traffic",
    ),
    (
        "in this to gauge whether I love rule, he is blocking leg team users or only malicious traffic",
        "how would you gauge whether a WAF rule is blocking legitimate users or only malicious traffic",
    ),
    (
        "How old do you build security code and training for back end developers who work with Abyss",
        "How would you build secure coding training for backend developers who work with APIs",
    ),
    (
        "how old do you build security code and training for back end developers who work with Abyss",
        "how would you build secure coding training for backend developers who work with APIs",
    ),
    (
        "To integrate SAS into a CS and you without blocking every match. Request",
        "How would you integrate SAST into CI/CD without blocking every merge request",
    ),
    (
        "to integrate SAS into a CS and you without blocking every match. Request",
        "how would you integrate SAST into CI/CD without blocking every merge request",
    ),
    (
        "How old do you tune in above her rule that Melox and mobile IP traffic",
        "How would you tune a WAF rule that blocks legitimate mobile API traffic",
    ),
    (
        "how old do you tune in above her rule that Melox and mobile IP traffic",
        "how would you tune a WAF rule that blocks legitimate mobile API traffic",
    ),
    (
        "How do you taste my mobile IP traffic for after two authorization and for And follow flows",
        "How do you test deep links and universal links for account takeover risks",
    ),
    (
        "how do you taste my mobile IP traffic for after two authorization and for And follow flows",
        "how do you test deep links and universal links for account takeover risks",
    ),
    (
        "Why wall three tests were there an API endpoint? Clicks sensitive wallet metadata throughout a xsife.expo exp exp exp",
        "What would you test when an API endpoint leaks sensitive wallet metadata through XSS exposure",
    ),
    (
        "why wall three tests were there an API endpoint? Clicks sensitive wallet metadata throughout a xsife.expo exp exp exp",
        "what would you test when an API endpoint leaks sensitive wallet metadata through XSS exposure",
    ),
    (
        "I will suit this weather cause an exploitable riser that just misconfigurate",
        "How would you decide whether this is an exploitable risk or just a misconfiguration",
    ),
    (
        "i will suit this weather cause an exploitable riser that just misconfigurate",
        "how would you decide whether this is an exploitable risk or just a misconfiguration",
    ),
    (
        "Oh, hold to your comfy clothes. Api shield. She's having validation. And what traffic vault you put into lock mode before unlocking",
        "How would you configure Cloudflare API Shield schema validation, and what traffic would you put into log mode before blocking",
    ),
    (
        "oh, hold to your comfy clothes. Api shield. She's having validation. And what traffic vault you put into lock mode before unlocking",
        "how would you configure Cloudflare API Shield schema validation, and what traffic would you put into log mode before blocking",
    ),
    ("hold to your comfy clothes", "configure Cloudflare"),
    ("Hold to your comfy clothes", "configure Cloudflare"),
    ("Api shield", "API Shield"),
    ("api shield", "API Shield"),
    ("She's having validation", "schema validation"),
    ("she's having validation", "schema validation"),
    ("traffic vault", "traffic would"),
    ("Traffic vault", "traffic would"),
    ("lock mode", "log mode"),
    ("Lock mode", "log mode"),
    ("before unlocking", "before blocking"),
    ("Before unlocking", "before blocking"),
    ("I love rule", "WAF rule"),
    ("i love rule", "WAF rule"),
    ("leg team users", "legitimate users"),
    ("Leg team users", "legitimate users"),
    ("security code and training", "secure coding training"),
    ("Security code and training", "secure coding training"),
    ("back end developers", "backend developers"),
    ("Back end developers", "backend developers"),
    ("work with Abyss", "work with APIs"),
    ("Work with Abyss", "work with APIs"),
    ("Clicks sensitive wallet metadata", "leaks sensitive wallet metadata"),
    ("clicks sensitive wallet metadata", "leaks sensitive wallet metadata"),
    ("xsife.expo exp exp exp", "XSS exposure"),
    ("exploitable riser", "exploitable risk"),
    ("Exploitable riser", "exploitable risk"),
    ("misconfigurate", "misconfiguration"),
    ("Misconfigurate", "misconfiguration"),
    (
        "security assistance Crypto World Impacment up before a major race",
        "security assurance of crypto wallet implementation before a major release",
    ),
    (
        "Security assistance Crypto World Impacment up before a major race",
        "security assurance of crypto wallet implementation before a major release",
    ),
    ("Crypto World Impacment", "crypto wallet implementation"),
    ("crypto world impacment", "crypto wallet implementation"),
    ("major race", "major release"),
    ("Major race", "major release"),
    ("all shared priorities I desires", "would you prioritize"),
    ("All shared priorities I desires", "would you prioritize"),
    (
        "non custodial crypto? Wallet application",
        "non-custodial crypto wallet application",
    ),
    (
        "Non custodial crypto? Wallet application",
        "non-custodial crypto wallet application",
    ),
    (
        "How old are you to sew to creation authorization logic",
        "How would you secure authorization logic",
    ),
    (
        "how old are you to sew to creation authorization logic",
        "how would you secure authorization logic",
    ),
    ("Vapor in web application or IP", "a web application or API"),
    ("vapor in web application or IP", "a web application or API"),
    (
        "How wolf do you validate where embark bounty reports",
        "How would you validate whether bug bounty reports",
    ),
    (
        "how wolf do you validate where embark bounty reports",
        "how would you validate whether bug bounty reports",
    ),
    ("actually exploit exploitable", "actually exploitable"),
    ("Actually exploit exploitable", "actually exploitable"),
    (
        "How old do you tune cloud photo of of IP shield Aurelius",
        "How would you tune Cloudflare or IP shield rules",
    ),
    (
        "how old do you tune cloud photo of of IP shield Aurelius",
        "how would you tune Cloudflare or IP shield rules",
    ),
    ("legume users", "legitimate users"),
    ("Legume users", "legitimate users"),
    (
        "business log for vulnerabilities that Aftermath scanner usually miss",
        "business logic vulnerabilities that automated scanners usually miss",
    ),
    (
        "Business log for vulnerabilities that Aftermath scanner usually miss",
        "business logic vulnerabilities that automated scanners usually miss",
    ),
    (
        "application security check and c s c d pipeline",
        "application security checks into a CI/CD pipeline",
    ),
    ("SAS into a CS and you", "SAST into CI/CD"),
    ("sas into a CS and you", "SAST into CI/CD"),
    ("blocking every match. Request", "blocking every merge request"),
    ("Blocking every match. Request", "blocking every merge request"),
    ("above her rule", "WAF rule"),
    ("Above her rule", "WAF rule"),
    (
        "Melox and mobile IP traffic",
        "blocks legitimate mobile API traffic",
    ),
    (
        "melox and mobile IP traffic",
        "blocks legitimate mobile API traffic",
    ),
    (
        "taste my mobile IP traffic",
        "test deep links and universal links",
    ),
    (
        "Taste my mobile IP traffic",
        "test deep links and universal links",
    ),
    (
        "after two authorization and for And follow flows",
        "account takeover risks",
    ),
    (
        "Application security check and c s c d pipeline",
        "application security checks into a CI/CD pipeline",
    ),
    ("slowing down the wall press", "slowing down the workflow"),
    ("Slowing down the wall press", "slowing down the workflow"),
    (
        "Appian point click sensitive OLED relative metadata",
        "API endpoint leaks sensitive object-level metadata",
    ),
    (
        "appian point click sensitive OLED relative metadata",
        "API endpoint leaks sensitive object-level metadata",
    ),
    (
        "how well do you assess? Severity and communication the risk to in generic",
        "how would you assess severity and communicate the risk to engineering",
    ),
    (
        "How well do you assess? Severity and communication the risk to in generic",
        "How would you assess severity and communicate the risk to engineering",
    ),
    (
        "How old do you build a security test to stretch any four web application back in service and API",
        "How would you build a security testing strategy for web application, backend services, and APIs",
    ),
    (
        "how old do you build a security test to stretch any four web application back in service and API",
        "how would you build a security testing strategy for web application, backend services, and APIs",
    ),
    (
        "across the across pre release and post release stage",
        "across pre-release and post-release stages",
    ),
    ("Software бил в materials", "Software Bill of Materials"),
    ("Software бил materials", "Software Bill of Materials"),
    ("software бил в materials", "Software Bill of Materials"),
    ("software бил materials", "Software Bill of Materials"),
    ("Software build materials", "Software Bill of Materials"),
    ("software build materials", "Software Bill of Materials"),
    ("WASP TOP TEN", "OWASP Top 10"),
    ("WASP TOP 10", "OWASP Top 10"),
    ("WASP TOP", "OWASP Top"),
    ("OWASP TOP TEN", "OWASP Top 10"),
    ("OWASP TOP 10", "OWASP Top 10"),
    ("OWASP TOP", "OWASP Top"),
    ("васп топ тен", "OWASP Top 10"),
    ("Васп топ тен", "OWASP Top 10"),
    ("васп топ 10", "OWASP Top 10"),
    ("Васп топ 10", "OWASP Top 10"),
    ("сбомов", "SBOM"),
    ("Сбомов", "SBOM"),
    ("сбомы", "SBOM"),
    ("Сбомы", "SBOM"),
    ("сбом", "SBOM"),
    ("Сбом", "SBOM"),
    ("танджи", "Tangem"),
    ("Танджи", "Tangem"),
    ("танджем", "Tangem"),
    ("Танджем", "Tangem"),
    ("Что такое даст", "Что такое DAST"),
    ("что такое даст", "что такое DAST"),
    ("Объясни даст", "Объясни DAST"),
    ("объясни даст", "объясни DAST"),
    ("Расскажи про даст", "Расскажи про DAST"),
    ("расскажи про даст", "расскажи про DAST"),
    ("Что такое саст", "Что такое SAST"),
    ("что такое саст", "что такое SAST"),
    ("Объясни саст", "Объясни SAST"),
    ("объясни саст", "объясни SAST"),
    ("Расскажи про саст", "Расскажи про SAST"),
    ("расскажи про саст", "расскажи про SAST"),
    ("Что такое ска", "Что такое SCA"),
    ("что такое ска", "что такое SCA"),
    ("Объясни ска", "Объясни SCA"),
    ("объясни ска", "объясни SCA"),
    ("Расскажи про ска", "Расскажи про SCA"),
    ("расскажи про ска", "расскажи про SCA"),
    ("Sasta", "SAST"),
    ("sasta", "SAST"),
    ("саста", "SAST"),
    ("Саста", "SAST"),
    ("Dasta", "DAST"),
    ("dasta", "DAST"),
    ("даста", "DAST"),
    ("Даста", "DAST"),
    ("dDevOps", "DevOps"),
    ("DDevOps", "DevOps"),
    ("delops", "DevOps"),
    ("Delops", "DevOps"),
    ("develops", "DevOps"),
    ("Develops", "DevOps"),
    ("дивопса", "DevOps"),
    ("дивопсов", "DevOps"),
    ("дивопс", "DevOps"),
    ("диопса", "DevOps"),
    ("диопсов", "DevOps"),
    ("диопс", "DevOps"),
    ("девопса", "DevOps"),
    ("девопсов", "DevOps"),
    ("девопс", "DevOps"),
    ("Девопс", "DevOps"),
    ("удивовца", "DevOps"),
    ("удивовцев", "DevOps"),
    ("ватсве девопсы", "DevOps"),
    ("m tls", "mTLS"),
    ("M TLS", "mTLS"),
    ("MTLS", "mTLS"),
    ("mtls", "mTLS"),
    ("Tcp-дам", "tcpdump"),
    ("tcp-дам", "tcpdump"),
    ("TCP Dumb", "tcpdump"),
    ("tcp dumb", "tcpdump"),
    ("тсп-дам", "tcpdump"),
    ("BISC-64", "Base64"),
    ("BISC64", "Base64"),
    ("bisc-64", "Base64"),
    ("bisc64", "Base64"),
    ("BIC-64", "Base64"),
    ("BIC64", "Base64"),
    ("BIS-64", "Base64"),
    ("BIS64", "Base64"),
    ("B 64", "B64"),
    ("b 64", "B64"),
    ("Бейс-64", "Base64"),
    ("Бейс 64", "Base64"),
    ("бейс-64", "Base64"),
    ("бейс 64", "Base64"),
    ("Бейсик 64", "Base64"),
    ("бейсик 64", "Base64"),
    ("би си 64", "Base64"),
    ("Би си 64", "Base64"),
    ("Sertu", "cert"),
    ("sertu", "cert"),
    ("Серту", "cert"),
    ("серту", "cert"),
    ("trife roads", "traceroute"),
    ("Trife roads", "traceroute"),
    ("trife route", "traceroute"),
    ("Trife route", "traceroute"),
    ("trace route", "traceroute"),
    ("Trace route", "traceroute"),
    ("GET Lab", "GitLab"),
    ("GETLab", "GitLab"),
    ("GetLab", "GitLab"),
    ("Gitlab", "GitLab"),
    ("gitlab", "GitLab"),
    ("getlab", "GitLab"),
    ("getlub", "GitLab"),
    ("Getlub", "GitLab"),
    ("declub", "GitLab"),
    ("Гетлаба", "GitLab"),
    ("Гетлабе", "GitLab"),
    ("Гетлабу", "GitLab"),
    ("Гетлаб", "GitLab"),
    ("Гитлаба", "GitLab"),
    ("Гитлабе", "GitLab"),
    ("Гитлабу", "GitLab"),
    ("Гитлаб", "GitLab"),
    ("Arvor", "Harbor"),
    ("arvor", "Harbor"),
    ("Harva", "Harbor"),
    ("harva", "Harbor"),
    ("Harbot", "Harbor"),
    ("harbot", "Harbor"),
    ("tirebor", "Harbor"),
    ("Харбора", "Harbor"),
    ("Харборе", "Harbor"),
    ("Харбор", "Harbor"),
    ("Netsus", "Nexus"),
    ("netsus", "Nexus"),
    ("Exas", "Nexus"),
    ("exas", "Nexus"),
    ("Нексуса", "Nexus"),
    ("Нексусе", "Nexus"),
    ("Нексус", "Nexus"),
    ("Volta", "Vault"),
    ("volta", "Vault"),
    ("Valta", "Vault"),
    ("valta", "Vault"),
    ("Walt", "Vault"),
    ("walt", "Vault"),
    ("LotWorld", "Vault"),
    ("Волта", "Vault"),
    ("Волт", "Vault"),
    ("волта", "Vault"),
    ("волт", "Vault"),
    ("конфлюенса", "Confluence"),
    ("конфлюенсу", "Confluence"),
    ("конфлюенсом", "Confluence"),
    ("конфлюенсе", "Confluence"),
    ("конфлюенс", "Confluence"),
    ("Конфлюенс", "Confluence"),
    ("Team City", "TeamCity"),
    ("team city", "TeamCity"),
    ("Twe City", "TeamCity"),
    ("twe city", "TeamCity"),
    ("teamcity", "TeamCity"),
    ("not group", "node group"),
    ("not группу", "node group"),
    ("not группе", "node group"),
    ("node group", "node group"),
    ("нот группа", "node group"),
    ("нот-группа", "node group"),
    ("нот-группу", "node group"),
    ("нот-группе", "node group"),
    ("нод группа", "node group"),
    ("нод-группа", "node group"),
    ("нод-группу", "node group"),
    ("нод-группе", "node group"),
    ("CI CD", "CI/CD"),
    ("CICD", "CI/CD"),
    ("ICD", "CI/CD"),
    ("си ай си ди", "CI/CD"),
    ("Си ай си ди", "CI/CD"),
    ("Jaba", "job"),
    ("Joba", "job"),
    ("boost", "Burp Suite"),
    ("Boost", "Burp Suite"),
    ("Burg Suite Professional", "Burp Suite Professional"),
    ("burg suite professional", "Burp Suite Professional"),
    ("Burg Suite", "Burp Suite"),
    ("burg suite", "Burp Suite"),
    ("burp suite professional", "Burp Suite Professional"),
    ("burp suite", "Burp Suite"),
    ("берп сьют", "Burp Suite"),
    ("Берп сьют", "Burp Suite"),
    ("бурп сьют", "Burp Suite"),
    ("Бурп сьют", "Burp Suite"),
    ("о вас к западу", "OWASP ZAP"),
    ("О вас к западу", "OWASP ZAP"),
    ("о вас зап", "OWASP ZAP"),
    ("О вас зап", "OWASP ZAP"),
    ("овасп зап", "OWASP ZAP"),
    ("OWASP зап", "OWASP ZAP"),
    ("начать с Запада", "начать с OWASP ZAP"),
    ("начать с запада", "начать с OWASP ZAP"),
    ("Nucai", "Nuclei"),
    ("nucai", "Nuclei"),
    ("нукай", "Nuclei"),
    ("Нукaй", "Nuclei"),
    ("нюклей", "Nuclei"),
    ("Нюклей", "Nuclei"),
    ("firecrecards", "Firecracker"),
    ("firecraker", "Firecracker"),
    ("firecracker", "Firecracker"),
    ("Singrep", "Semgrep"),
    ("singrep", "Semgrep"),
    ("SimGreb", "Semgrep"),
    ("simgreb", "Semgrep"),
    ("sing grap", "Semgrep"),
    ("sing grep", "Semgrep"),
    ("sing reb", "Semgrep"),
    ("asting grap", "Semgrep"),
    ("asting grep", "Semgrep"),
    ("сем греп", "Semgrep"),
    ("Сем греп", "Semgrep"),
    ("семгреп", "Semgrep"),
    ("Семгреп", "Semgrep"),
    ("eTrivy", "Trivy"),
    ("etrivy", "Trivy"),
    ("SONAR", "SonarQube"),
    ("сонара", "SonarQube"),
    ("сонару", "SonarQube"),
    ("сонар", "SonarQube"),
    ("Сонар", "SonarQube"),
    ("kicklog", "Keycloak"),
    ("Kicklog", "Keycloak"),
    ("киклаке", "Keycloak"),
    ("Киклаке", "Keycloak"),
    ("киклака", "Keycloak"),
    ("Киклака", "Keycloak"),
    ("киклак", "Keycloak"),
    ("Киклак", "Keycloak"),
    ("jiva", "Jira"),
    ("Jiva", "Jira"),
    ("Джира", "Jira"),
    ("Джире", "Jira"),
    ("Джиру", "Jira"),
    ("Джиры", "Jira"),
    ("джира", "Jira"),
    ("джире", "Jira"),
    ("джиру", "Jira"),
    ("джиры", "Jira"),
    ("Google Server Secutive", "Google Cybersecurity"),
    ("Google server secutive", "Google Cybersecurity"),
    ("Google Cyber Security", "Google Cybersecurity"),
    ("Google cyber security", "Google Cybersecurity"),
    ("key clock", "Keycloak"),
    ("Key clock", "Keycloak"),
    ("keyclock", "Keycloak"),
    ("Keyclock", "Keycloak"),
    ("keklock", "Keycloak"),
    ("Keklock", "Keycloak"),
    ("киклок", "Keycloak"),
    ("Киклок", "Keycloak"),
    ("кеклок", "Keycloak"),
    ("Кеклок", "Keycloak"),
    ("OEDC", "OIDC"),
    ("oedc", "OIDC"),
    ("OADC", "OIDC"),
    ("oadc", "OIDC"),
    ("o-adc", "OIDC"),
    ("O-ADC", "OIDC"),
    ("PDX", "TDX"),
    ("pdx", "TDX"),
    ("FDX", "TDX"),
    ("fdx", "TDX"),
    ("TDM", "TDX"),
    ("tdm", "TDX"),
    ("QD2", "K2"),
    ("qd2", "K2"),
    ("QD 2", "K2"),
    ("qd 2", "K2"),
    ("K 2", "K2"),
    ("k 2", "K2"),
    ("ИК-2", "K2"),
    ("ик-2", "K2"),
    ("ИК2", "K2"),
    ("ик2", "K2"),
    ("ИК 2", "K2"),
    ("ик 2", "K2"),
    ("И К-2", "K2"),
    ("и к-2", "K2"),
    ("И К 2", "K2"),
    ("и к 2", "K2"),
    ("КА-2", "K2"),
    ("ка-2", "K2"),
    ("КА2", "K2"),
    ("ка2", "K2"),
    ("КА 2", "K2"),
    ("ка 2", "K2"),
    ("к 2", "K2"),
    ("К 2", "K2"),
    ("мк2", "K2"),
    ("МК2", "K2"),
    ("мк 2", "K2"),
    ("МК 2", "K2"),
    ("ек2", "K2"),
    ("ЕК2", "K2"),
    ("ек 2", "K2"),
    ("ЕК 2", "K2"),
    ("канал к 2", "канал K2"),
    ("канал К 2", "канал K2"),
    ("канала к 2", "канала K2"),
    ("канала К 2", "канала K2"),
    ("канал ИК-2", "канал K2"),
    ("канал ик-2", "канал K2"),
    ("канал ИК 2", "канал K2"),
    ("канал ик 2", "канал K2"),
    ("канал КА-2", "канал K2"),
    ("канал ка-2", "канал K2"),
    ("канал КА 2", "канал K2"),
    ("канал ка 2", "канал K2"),
    ("hsam", "HSM"),
    ("Hsam", "HSM"),
    ("ASSAH", "SSH"),
    ("SSAH", "SSH"),
    ("Tvm", "VM"),
    ("mini polying", "mini polling"),
    ("мини polying", "mini polling"),
    ("polying", "polling"),
    ("dimetime", "downtime"),
    ("Dimetime", "downtime"),
    ("done time", "downtime"),
    ("Done time", "downtime"),
    ("PCC ридер", "PC/SC reader"),
    ("USB PCC ридер", "USB PC/SC reader"),
    ("PCC", "PC/SC"),
    ("Control plan", "Control Plane"),
    ("control plan", "Control Plane"),
    ("Control play", "Control Plane"),
    ("control play", "Control Plane"),
    ("Control pling", "Control Plane"),
    ("control pling", "Control Plane"),
    ("Global Road", "Global Router"),
    ("global road", "Global Router"),
    ("SelectTale", "Selectel"),
    ("selecttale", "Selectel"),
    ("Select tell", "Selectel"),
    ("select tell", "Selectel"),
    ("Sliktelry", "Selectel"),
    ("sliktelry", "Selectel"),
    ("селектейл", "Selectel"),
    ("Селектейл", "Selectel"),
    ("Селектеллу", "Selectel"),
    ("селектеллу", "Selectel"),
    ("Селектелл", "Selectel"),
    ("селектелл", "Selectel"),
    ("UBK", "YubiKey"),
    ("ubk", "YubiKey"),
    ("YBK", "YubiKey"),
    ("ybk", "YubiKey"),
    ("юби кей", "YubiKey"),
    ("Юби кей", "YubiKey"),
    ("юбикей", "YubiKey"),
    ("Юбикей", "YubiKey"),
    ("Clibreprood tools", "CryptoPro tools"),
    ("clibreprood tools", "CryptoPro tools"),
    ("Crypto Prood tools", "CryptoPro tools"),
    ("crypto prood tools", "CryptoPro tools"),
    ("Crypto Pro", "CryptoPro"),
    ("crypto pro", "CryptoPro"),
    ("Cryptu Pro", "CryptoPro"),
    ("cryptu pro", "CryptoPro"),
    ("CryptuPro", "CryptoPro"),
    ("cryptupro", "CryptoPro"),
    ("CryptoProp", "CryptoPro"),
    ("cryptoprop", "CryptoPro"),
    ("Crypto Prop", "CryptoPro"),
    ("crypto prop", "CryptoPro"),
    ("CliptoPro", "CryptoPro"),
    ("cliptopro", "CryptoPro"),
    ("скрипта про", "CryptoPro"),
    ("Скрипта про", "CryptoPro"),
    ("скрипт про", "CryptoPro"),
    ("Скрипт про", "CryptoPro"),
    ("крипто про", "CryptoPro"),
    ("Крипто Про", "CryptoPro"),
    ("Copois", "CryptoPro CSP"),
    ("copois", "CryptoPro CSP"),
    ("Cropois", "CryptoPro CSP"),
    ("cropois", "CryptoPro CSP"),
    ("КСП", "CSP"),
    ("ксп", "CSP"),
    ("ЦСП", "CSP"),
    ("цсп", "CSP"),
    ("сиспи", "CSP"),
    ("Сиспи", "CSP"),
    ("ХСМа", "HSM"),
    ("хсма", "HSM"),
    ("хсме", "HSM"),
    ("ХСМе", "HSM"),
    ("ХСМ", "HSM"),
    ("хэсэма", "HSM"),
    ("хэсэм", "HSM"),
    ("Хэсэм", "HSM"),
    ("rootoken", "Rutoken"),
    ("Rootoken", "Rutoken"),
    ("рутокена", "Rutoken"),
    ("рутокен", "Rutoken"),
    ("рутокела", "Rutoken"),
    ("рутокелу", "Rutoken"),
    ("рутокел", "Rutoken"),
    ("Рутокен", "Rutoken"),
    ("Treshare IP", "Treasure API"),
    ("treshare ip", "Treasure API"),
    ("Treshare API", "Treasure API"),
    ("treshare api", "Treasure API"),
    ("Treasure IP", "Treasure API"),
    ("treasure ip", "Treasure API"),
    ("Cafку", "Kafka"),
    ("кафку", "Kafka"),
    ("Кафку", "Kafka"),
    ("кавки", "Kafka"),
    ("Кавки", "Kafka"),
    ("кафки", "Kafka"),
    ("Кафки", "Kafka"),
    ("SSSH", "SSH"),
    ("sssh", "SSH"),
    ("саша ключи", "SSH ключи"),
    ("Саша ключи", "SSH ключи"),
    ("саша ключ", "SSH ключ"),
    ("Саша ключ", "SSH ключ"),
    ("AttP-код", "TOTP-код"),
    ("attp-код", "TOTP-код"),
    ("AttP код", "TOTP код"),
    ("attp код", "TOTP код"),
    ("Ause Provider", "Auth Provider"),
    ("ause provider", "Auth Provider"),
    ("GROPAN", "Grafana"),
    ("gropan", "Grafana"),
    ("Locky", "Loki"),
    ("locky", "Loki"),
    ("lockey", "Loki"),
    ("Lockey", "Loki"),
    ("полиси gateway", "Policy Gateway"),
    ("Полиси gateway", "Policy Gateway"),
    ("policy server", "policy-server"),
    ("Policy server", "policy-server"),
    ("полиси сервер", "policy-server"),
    ("полиси-сервер", "policy-server"),
    ("Полиси сервер", "policy-server"),
    ("сервер полисе", "policy-server"),
    ("монадатные политики", "мандатные политики"),
    ("Монадатные политики", "мандатные политики"),
    ("политики Астеры", "политики Astra"),
    ("политики астеры", "политики Astra"),
    ("мандатные политики Астра", "мандатные политики Astra"),
    ("Астера", "Astra"),
    ("Астеры", "Astra"),
    ("астеры", "Astra"),
    ("SOKET", "socket"),
    ("USB-сокета", "USB socket"),
    ("USB-сокет", "USB socket"),
    ("USB сокета", "USB socket"),
    ("USB сокет", "USB socket"),
    ("юсб-сокета", "USB socket"),
    ("юсб сокета", "USB socket"),
    ("сокета", "socket"),
    ("сокет", "socket"),
    ("судов", "sudo"),
    ("ссудо", "sudo"),
    ("судо", "sudo"),
    ("права рута", "права root"),
    ("правами рута", "правами root"),
    ("EGRS", "egress"),
    ("Registery", "registry"),
    ("registery", "registry"),
    ("pro Metals", "Prometheus"),
    ("pro Metal", "Prometheus"),
    ("про Metals", "Prometheus"),
    ("про Metal", "Prometheus"),
    ("GRAFAN", "Grafana"),
    ("Feature Toggle", "FeatureToggle"),
    ("feature toggle", "FeatureToggle"),
    ("fitch", "feature"),
    ("фичстогу", "feature toggle"),
    ("фичесток", "feature toggle"),
    ("tdx", "TDX"),
    ("check сумму", "checksum"),
    ("check сумма", "checksum"),
    ("чек-сумма", "checksum"),
    ("чек-сумму", "checksum"),
    ("оптулокно", "оптоволокно"),
    ("оптулокна", "оптоволокна"),
    ("автоволокно", "оптоволокно"),
    ("автоволокна", "оптоволокна"),
    ("gost", "GOST"),
    ("Gost", "GOST"),
    ("json", "JSON"),
    ("physing", "fuzzing"),
    ("Physing", "fuzzing"),
    ("физинг", "fuzzing"),
    ("Физинг", "fuzzing"),
    ("фазинг", "fuzzing"),
    ("Фазинг", "fuzzing"),
    ("SDLS", "SDLC"),
    ("sdls", "SDLC"),
    ("СДЛС", "SDLC"),
    ("сдлс", "SDLC"),
    ("evopsing", "DevOps"),
    ("Evopsing", "DevOps"),
    ("evops", "DevOps"),
    ("Evops", "DevOps"),
    ("secups", "SecOps"),
    ("Secups", "SecOps"),
    ("secDojo", "SecOps"),
    ("SecDojo", "SecOps"),
    ("defsy cops", "DevSecOps"),
    ("Defsy cops", "DevSecOps"),
    ("dev sec ops", "DevSecOps"),
    ("Dev sec ops", "DevSecOps"),
    ("АВСе", "AWS"),
    ("АВСа", "AWS"),
    ("АВС", "AWS"),
    ("ABS", "AWS"),
    ("AccessS", "XSS"),
    ("accessS", "XSS"),
    ("эксессесс", "XSS"),
    ("Эксессесс", "XSS"),
    ("wav", "WAF"),
    ("Wav", "WAF"),
    ("WAV", "WAF"),
    ("Cors", "CORS"),
    ("cors", "CORS"),
    ("JavaTi токен", "JWT токен"),
    ("javati токен", "JWT токен"),
    ("TownScript", "TypeScript"),
    ("townscript", "TypeScript"),
    ("нот на до", "Node.js"),
    ("нот знаком", "Node знаком"),
    ("Нот знаком", "Node знаком"),
    ("с нодой как", "с Node.js как"),
    ("на ноде всё написано", "на Node.js всё написано"),
    ("SAG ключи", "SSH ключи"),
    ("саг ключи", "SSH ключи"),
    ("ProdeConder", "prod contour"),
    ("ProdeConture", "prod contour"),
    ("без практис", "best practices"),
    ("Без практис", "best practices"),
    ("hyper liquid", "Hyperliquid"),
    ("Hyper liquid", "Hyperliquid"),
    ("aster liter", "Aster"),
    ("Aster liter", "Aster"),
    ("drivy", "Trivy"),
    ("Drivy", "Trivy"),
    ("TriV", "Trivy"),
    ("3 виллы", "Trivy"),
    ("триви", "Trivy"),
    ("Триви", "Trivy"),
    ("три ви", "Trivy"),
    ("Три ви", "Trivy"),
    ("defect dother", "DefectDojo"),
    ("Defect dother", "DefectDojo"),
    ("defect dog", "DefectDojo"),
    ("Defect dog", "DefectDojo"),
    ("effect dog", "DefectDojo"),
    ("Effect dog", "DefectDojo"),
    ("defect dojo", "DefectDojo"),
    ("Defect dojo", "DefectDojo"),
    ("дефект доджо", "DefectDojo"),
    ("Дефект доджо", "DefectDojo"),
    ("до даст", "до DAST"),
    ("дальше уже Dust", "дальше уже DAST"),
    ("дальше уже dust", "дальше уже DAST"),
    (
        "сначала сделать 3, потом сделать DefectDojo",
        "сначала сделать Trivy, потом сделать DefectDojo",
    ),
    ("возух", "Wazuh"),
    ("Возух", "Wazuh"),
    ("с воздухом", "с Wazuh"),
    ("с воздуха", "с Wazuh"),
    ("через воздух", "через Wazuh"),
    ("вазу", "Wazuh"),
    ("ВАЗУ", "Wazuh"),
    ("Passecurity", "AppSec security"),
    ("сока налиток", "SOC analyst"),
    ("Сока налиток", "SOC analyst"),
    ("сок аналитик", "SOC analyst"),
    ("Сок аналитик", "SOC analyst"),
    ("рандбуками", "runbook"),
    ("рандбуков", "runbook"),
    ("рандбуки", "runbook"),
    ("рандбук", "runbook"),
    ("ранбуками", "runbook"),
    ("ранбуков", "runbook"),
    ("ранбуки", "runbook"),
    ("ранбук", "runbook"),
    ("нод эCSPортер", "node exporter"),
    ("нод CSPортер", "node exporter"),
    ("node эCSPортер", "node exporter"),
    ("node CSPортер", "node exporter"),
    ("eam politik", "IAM policies"),
    ("EAM politik", "IAM policies"),
    ("ай эм политики", "IAM policies"),
    ("ай эм политик", "IAM policies"),
    ("cluster admin", "cluster-admin"),
    ("Cluster admin", "cluster-admin"),
    ("кластер админ", "cluster-admin"),
    ("Кластер админ", "cluster-admin"),
    ("forwall", "firewall"),
    ("Forwall", "firewall"),
    ("stagejet", "stage"),
    ("statejet", "stage"),
    ("Customed", "Custodian"),
    ("Custodians", "Custodian"),
    ("Opport GraphQL", "GraphQL"),
    ("ICYNITWALL", "HashiCorp Vault"),
    ("Icynitwall", "HashiCorp Vault"),
    (
        "Git Postgreat Postgreat Patched Elete",
        "GET, POST, PUT, PATCH, DELETE",
    ),
    (
        "Git Postgreat Postgreat Patched Delete",
        "GET, POST, PUT, PATCH, DELETE",
    ),
    ("Git Postgreat Patched Elete", "GET, POST, PATCH, DELETE"),
    ("методе Git", "методе GET"),
    ("у Git", "у GET"),
    ("в Git", "в GET"),
    ("Git это", "GET это"),
    ("Git есть body", "GET есть body"),
    ("гетто и поста", "GET и POST"),
    ("Postgreat", "POST"),
    ("postgreat", "POST"),
    ("Patched Elete", "PATCH, DELETE"),
    ("Patched Delete", "PATCH, DELETE"),
    ("Elete", "DELETE"),
    ("forized. Keys", "authorized_keys"),
    ("forized Keys", "authorized_keys"),
    ("authorized. Keys", "authorized_keys"),
    ("BinSH", "/bin/sh"),
    ("BASP", "bash"),
    ("CWE TLS", "kubectl exec"),
];

fn deepgram_keyterm_query(language: &str) -> String {
    if !deepgram_keyterms_supported(language) {
        return String::new();
    }

    let mut query = String::new();

    for term in DEEPGRAM_KEYTERMS {
        let encoded_term = encode_query_value(term);
        let next_len = KEYTERM_QUERY_PREFIX.len() + encoded_term.len();
        if query.len() + next_len > MAX_KEYTERM_QUERY_CHARS {
            break;
        }

        query.push_str(KEYTERM_QUERY_PREFIX);
        query.push_str(&encoded_term);
    }

    query
}

fn deepgram_keyterms_supported(language: &str) -> bool {
    language
        .split('-')
        .next()
        .is_some_and(|base| base.eq_ignore_ascii_case("en"))
}

fn normalize_appsec_terms(text: &str) -> String {
    APPSEC_TERM_REPLACEMENTS
        .iter()
        .fold(text.trim().to_string(), |current, (from, to)| {
            current.replace(from, to)
        })
}

fn encode_query_value(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            b' ' => vec!['+'],
            _ => {
                let hex = format!("%{:02X}", byte);
                hex.chars().collect::<Vec<_>>()
            }
        })
        .collect()
}

fn merge_transcripts(current: &str, next: &str) -> String {
    let current_trimmed = current.trim();
    let next_trimmed = next.trim();

    if current_trimmed.is_empty() {
        return next_trimmed.to_string();
    }
    if next_trimmed.is_empty() {
        return current_trimmed.to_string();
    }

    let current_norm = normalize_transcript(current_trimmed);
    let next_norm = normalize_transcript(next_trimmed);

    if current_norm == next_norm {
        return current_trimmed.to_string();
    }
    if current_norm.contains(&next_norm) {
        return current_trimmed.to_string();
    }
    if next_norm.contains(&current_norm) {
        return next_trimmed.to_string();
    }

    let current_words: Vec<&str> = current_norm.split_whitespace().collect();
    let next_words: Vec<&str> = next_norm.split_whitespace().collect();
    let shared_prefix = current_words
        .iter()
        .zip(next_words.iter())
        .take_while(|(left, right)| left == right)
        .count();
    if shared_prefix >= 3 {
        if next_words.len() >= current_words.len() {
            return next_trimmed.to_string();
        }
        return current_trimmed.to_string();
    }

    let max_overlap = current_words.len().min(next_words.len());
    for overlap in (2..=max_overlap).rev() {
        if current_words[current_words.len() - overlap..] == next_words[..overlap] {
            let next_original_words: Vec<&str> = next_trimmed.split_whitespace().collect();
            let suffix = next_original_words.get(overlap..).unwrap_or(&[]).join(" ");
            if suffix.is_empty() {
                return current_trimmed.to_string();
            }
            return format!("{} {}", current_trimmed, suffix);
        }
    }

    cleanup_repeated_word_spans(&format!("{} {}", current_trimmed, next_trimmed))
}

fn cleanup_repeated_word_spans(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let original_words: Vec<&str> = trimmed.split_whitespace().collect();
    let normalized_words: Vec<String> = original_words
        .iter()
        .map(|word| normalize_transcript(word))
        .collect();
    let mut output: Vec<&str> = Vec::with_capacity(original_words.len());
    let mut index = 0;

    while index < original_words.len() {
        let remaining = original_words.len() - index;
        let max_span = (remaining / 2).min(24);
        let mut removed_repeat = false;

        for span in (3..=max_span).rev() {
            let left = &normalized_words[index..index + span];
            let right = &normalized_words[index + span..index + span * 2];
            if left.iter().all(|word| !word.is_empty()) && left == right {
                output.extend_from_slice(&original_words[index..index + span]);
                index += span * 2;
                removed_repeat = true;
                break;
            }
        }

        if !removed_repeat {
            output.push(original_words[index]);
            index += 1;
        }
    }

    output.join(" ")
}

fn final_candidate_from_interim(latest_interim: &str, final_text: &str) -> String {
    let interim_trimmed = latest_interim.trim();
    let final_trimmed = final_text.trim();

    if interim_trimmed.is_empty() {
        return final_trimmed.to_string();
    }
    if final_trimmed.is_empty() {
        return interim_trimmed.to_string();
    }

    let interim_word_count = transcript_word_count(interim_trimmed);
    let final_word_count = transcript_word_count(final_trimmed);

    // Deepgram sometimes emits a full interim hypothesis, then a very short
    // speech_final tail. Keep the longer context in that case.
    if final_word_count <= 2 && interim_word_count >= final_word_count + 3 {
        return merge_transcripts(interim_trimmed, final_trimmed);
    }

    if transcripts_overlap(interim_trimmed, final_trimmed) && interim_word_count > final_word_count
    {
        return merge_transcripts(interim_trimmed, final_trimmed);
    }

    final_trimmed.to_string()
}

fn transcript_word_count(value: &str) -> usize {
    normalize_transcript(value)
        .split_whitespace()
        .filter(|word| !word.is_empty())
        .count()
}

fn transcripts_overlap(left: &str, right: &str) -> bool {
    let left_norm = normalize_transcript(left);
    let right_norm = normalize_transcript(right);

    if left_norm.is_empty() || right_norm.is_empty() {
        return false;
    }
    if left_norm.contains(&right_norm) || right_norm.contains(&left_norm) {
        return true;
    }

    let left_words: Vec<&str> = left_norm.split_whitespace().collect();
    let right_words: Vec<&str> = right_norm.split_whitespace().collect();
    let max_overlap = left_words.len().min(right_words.len());
    for overlap in (2..=max_overlap).rev() {
        if left_words[left_words.len() - overlap..] == right_words[..overlap] {
            return true;
        }
        if right_words[right_words.len() - overlap..] == left_words[..overlap] {
            return true;
        }
    }

    false
}

fn normalize_transcript(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_lowercase().collect::<String>()
            } else {
                " ".to_string()
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// DeepgramSession — active WebSocket connection
// ---------------------------------------------------------------------------

pub struct DeepgramSession {
    ws: DeepgramWebSocket,
    /// Total seconds of audio sent to Deepgram (accumulated from sample count + rate).
    audio_sent_secs: f64,
    /// Instant when the latest audio chunk was sent.
    last_send_time: Instant,
    /// Instant when the latest keepalive was sent during silence.
    last_keepalive_time: Instant,
    /// Sample rate of audio being sent.
    sample_rate: u32,
    /// Finalized transcript fragments for the current utterance.
    final_transcript: String,
    /// Latest non-final hypothesis for the current utterance.
    latest_interim: String,
}

/// Transcript with STT latency info.
pub struct SttResult {
    pub text: String,
    /// Real STT latency: wall-clock time from utterance end to result received.
    pub stt_latency_ms: u64,
}

impl DeepgramSession {
    /// Send audio samples (f32 mono). Converts to i16 PCM internally.
    pub fn send_audio(&mut self, samples: &[f32]) -> Result<()> {
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|&s| {
                let i = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                i.to_le_bytes()
            })
            .collect();

        match self.ws.send(Message::Binary(bytes)) {
            Ok(()) => {
                self.audio_sent_secs += samples.len() as f64 / self.sample_rate as f64;
                self.last_send_time = Instant::now();
                self.last_keepalive_time = Instant::now();
                Ok(())
            }
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => {
                // Non-blocking socket buffer full — drop this chunk silently
                Ok(())
            }
            Err(e) => Err(anyhow::anyhow!("Failed to send audio to Deepgram: {}", e)),
        }
    }

    /// Keep idle sessions alive so Deepgram does not drop the websocket before speech starts.
    pub fn send_keepalive_if_idle(&mut self) -> Result<()> {
        const KEEPALIVE_AFTER_MS: u128 = 3_000;

        if self.last_send_time.elapsed().as_millis() < KEEPALIVE_AFTER_MS
            || self.last_keepalive_time.elapsed().as_millis() < KEEPALIVE_AFTER_MS
        {
            return Ok(());
        }

        match self
            .ws
            .send(Message::Text(r#"{"type":"KeepAlive"}"#.into()))
        {
            Ok(()) => {
                self.last_keepalive_time = Instant::now();
                debug!("Deepgram keepalive sent");
                Ok(())
            }
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => Ok(()),
            Err(e) => Err(anyhow::anyhow!("Failed to send Deepgram keepalive: {}", e)),
        }
    }

    /// Poll for a finalized segment.
    /// Non-blocking — returns None immediately if no data is available.
    /// Prefer speech_final to avoid splitting one spoken thought into multiple fragments.
    /// Fall back to is_final only if speech_final is absent.
    pub fn poll_transcript(&mut self) -> Result<Option<SttResult>> {
        loop {
            match self.ws.read() {
                Ok(Message::Text(text)) => {
                    debug!("Deepgram: {}", &text[..text.len().min(200)]);
                    match serde_json::from_str::<DgResponse>(&text) {
                        Ok(resp) => {
                            let is_complete = resp.speech_final == Some(true)
                                || (resp.speech_final.is_none() && resp.is_final == Some(true));
                            let transcript = resp
                                .channel
                                .and_then(|c| c.alternatives.into_iter().next())
                                .map(|a| a.transcript)
                                .unwrap_or_default();

                            let is_final = resp.is_final == Some(true);
                            let is_speech_final = resp.speech_final == Some(true);

                            if !transcript.trim().is_empty() {
                                if is_final || is_speech_final {
                                    let final_candidate = final_candidate_from_interim(
                                        &self.latest_interim,
                                        &transcript,
                                    );
                                    self.final_transcript =
                                        merge_transcripts(&self.final_transcript, &final_candidate);
                                    self.latest_interim.clear();
                                } else {
                                    self.latest_interim = transcript.trim().to_string();
                                }
                            }

                            if is_complete {
                                let completed_transcript = normalize_appsec_terms(
                                    &cleanup_repeated_word_spans(&merge_transcripts(
                                        &self.final_transcript,
                                        &self.latest_interim,
                                    )),
                                );
                                self.final_transcript.clear();
                                self.latest_interim.clear();

                                if completed_transcript.trim().is_empty() {
                                    continue;
                                }

                                // STT latency: how far behind real-time is Deepgram?
                                // audio_sent_secs = total audio duration sent
                                // utterance_end = start + duration (Deepgram's clock)
                                // The gap = (audio_sent - utterance_end) seconds of audio
                                //   that Deepgram still had buffered when it returned this result.
                                // Plus the network RTT from last send to now.
                                // Simplified: time since last audio send + processing backlog
                                let utterance_end_secs =
                                    resp.start.unwrap_or(0.0) + resp.duration.unwrap_or(0.0);
                                let backlog_secs = self.audio_sent_secs - utterance_end_secs;
                                let since_last_send_ms =
                                    self.last_send_time.elapsed().as_millis() as u64;
                                let stt_latency_ms =
                                    (backlog_secs * 1000.0).max(0.0) as u64 + since_last_send_ms;

                                info!(
                                    "Deepgram final: '{}' (stt={}ms, speech_final={:?}, is_final={:?})",
                                    completed_transcript,
                                    stt_latency_ms,
                                    resp.speech_final,
                                    resp.is_final
                                );
                                return Ok(Some(SttResult {
                                    text: completed_transcript,
                                    stt_latency_ms,
                                }));
                            }
                        }
                        Err(e) => debug!("Deepgram parse error: {}", e),
                    }
                }
                Ok(_) => {}
                Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => {
                    return Ok(None);
                }
                Err(e) => bail!("Deepgram WebSocket error: {}", e),
            }
        }
    }

    pub fn close(&mut self) {
        let _ = self.ws.send(Message::Binary(vec![]));
        let _ = self.ws.close(None);
    }
}

// ---------------------------------------------------------------------------
// Deepgram response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DgResponse {
    is_final: Option<bool>,
    speech_final: Option<bool>,
    start: Option<f64>,
    duration: Option<f64>,
    channel: Option<DgChannel>,
}

#[derive(Deserialize)]
struct DgChannel {
    alternatives: Vec<DgAlternative>,
}

#[derive(Deserialize)]
struct DgAlternative {
    transcript: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_final_tail_keeps_long_interim_context() {
        let candidate = final_candidate_from_interim(
            "Это длинная фраза, которая закончилась словом тебя",
            "тебя.",
        );

        assert_eq!(
            candidate,
            "Это длинная фраза, которая закончилась словом тебя"
        );
    }

    #[test]
    fn substantial_final_correction_beats_unrelated_interim() {
        let candidate = final_candidate_from_interim("Che ti abbia avuto?", "What's your name?");

        assert_eq!(candidate, "What's your name?");
    }

    #[test]
    fn keyterm_query_contains_appsec_terms() {
        let query = deepgram_keyterm_query("en");

        assert!(query.len() <= MAX_KEYTERM_QUERY_CHARS);
        assert!(query.contains("&keyterm=SBOM"));
        assert!(query.contains("&keyterm=Software+Bill+of+Materials"));
        assert!(query.contains("&keyterm=mTLS"));
        assert!(query.contains("&keyterm=tcpdump"));
        assert!(query.contains("&keyterm=DevSecOps"));
        assert!(query.contains("&keyterm=traceroute"));
        assert!(query.contains("&keyterm=GitLab"));
        assert!(query.contains("&keyterm=Harbor"));
        assert!(query.contains("&keyterm=Nexus"));
        assert!(query.contains("&keyterm=Jira"));
        assert!(query.contains("&keyterm=Keycloak"));
        assert!(query.contains("&keyterm=SonarQube"));
        assert!(query.contains("&keyterm=OIDC"));
        assert!(query.contains("&keyterm=YubiKey"));
        assert!(query.contains("&keyterm=CryptoPro"));
        assert!(query.contains("&keyterm=HSM"));
        assert!(query.contains("&keyterm=Rutoken"));
        assert!(query.contains("&keyterm=Astra"));
        assert!(query.contains("&keyterm=USB+socket"));
        assert!(query.contains("&keyterm=Firecracker"));
        assert!(query.contains("&keyterm=node+group"));
        assert!(query.contains("&keyterm=Treasure+API"));
        assert!(query.contains("&keyterm=Kafka"));
        assert!(query.contains("&keyterm=fuzzing"));
        assert!(query.contains("&keyterm=Trivy"));
        assert!(query.contains("&keyterm=SDLC"));
        assert!(query.contains("&keyterm=HashiCorp+Vault"));
    }

    #[test]
    fn keyterm_query_is_disabled_for_non_english_languages() {
        assert_eq!(deepgram_keyterm_query("ru"), "");
        assert_eq!(deepgram_keyterm_query("multi"), "");
    }

    #[test]
    fn deepgram_bad_request_detection_matches_http_400() {
        let error =
            anyhow::anyhow!("Failed to connect to Deepgram WebSocket: HTTP error: 400 Bad Request");

        assert!(is_deepgram_bad_request(&error));
    }

    #[test]
    fn appsec_terms_are_normalized_after_stt() {
        let text = "Окей, WASP TOP TEN и Software бил в materials. Tcp-дам, trife roads, defsy cops, jiva, Google Server Secutive, keyclock, OEDC, UBK, Clibreprood tools, Treshare IP, Cafку, SSSH, AttP-код, Ause Provider, Locky, GROPAN, physing, SDLS, drivy и ICYNITWALL тоже были. В методе Git есть body? АВСе, wav, AccessS, Cors, JavaTi токен, TownScript, SAG ключи, ProdeConture и hyper liquid. GETLab, Harva, Netsus, Volta, конфлюенсу, Twe City, not group, CICD, Jaba, firecraker, Singrep, SONAR, kicklog, Джире, CryptuPro, КСП, ХСМа, rootoken, кавки, policy server, монадатные политики Астеры, SOKET, USB-сокета, судов, права рута, EGRS, Registery, pro Metal, fitch, фичстогу, tdx, check сумму, автоволокно.";

        assert_eq!(
            normalize_appsec_terms(text),
            "Окей, OWASP Top 10 и Software Bill of Materials. tcpdump, traceroute, DevSecOps, Jira, Google Cybersecurity, Keycloak, OIDC, YubiKey, CryptoPro tools, Treasure API, Kafka, SSH, TOTP-код, Auth Provider, Loki, Grafana, fuzzing, SDLC, Trivy и HashiCorp Vault тоже были. В методе GET есть body? AWS, WAF, XSS, CORS, JWT токен, TypeScript, SSH ключи, prod contour и Hyperliquid. GitLab, Harbor, Nexus, Vault, Confluence, TeamCity, node group, CI/CD, job, Firecracker, Semgrep, SonarQube, Keycloak, Jira, CryptoPro, CSP, HSM, Rutoken, Kafka, policy-server, мандатные политики Astra, socket, USB socket, sudo, права root, egress, registry, Prometheus, feature, feature toggle, TDX, checksum, оптоволокно."
        );
    }

    #[test]
    fn noisy_interview_questions_are_normalized_after_stt() {
        let text = "How wolf do you validate where embark bounty reports and actually exploit exploitable or just theoretical. How old do you tune cloud photo of of IP shield Aurelius without breaking legume users. What's your process for the for detect and test business log for vulnerabilities that Aftermath scanner usually miss. How about you integrate, application security check and c s c d pipeline without slowing down the wall press too much.";

        assert_eq!(
            normalize_appsec_terms(text),
            "How would you validate whether bug bounty reports and actually exploitable or just theoretical. How would you tune Cloudflare or IP shield rules without breaking legitimate users. What's your process for the for detect and test business logic vulnerabilities that automated scanners usually miss. How about you integrate, application security checks into a CI/CD pipeline without slowing down the workflow too much."
        );
    }

    #[test]
    fn russian_appsec_acronym_questions_are_normalized_after_stt() {
        assert_eq!(
            normalize_appsec_terms("Привет, что такое даст? Объясни саст. Расскажи про ска. Кто такие танджи?"),
            "Привет, что такое DAST? Объясни SAST. Расскажи про SCA. Кто такие Tangem?"
        );
        assert_eq!(normalize_appsec_terms("Что это даст?"), "Что это даст?");
    }

    #[test]
    fn crypto_wallet_interview_questions_are_normalized_after_stt() {
        let text = "Security assistant of crypto wallet back end IP before a major release. What a p vulnerabilities will prioritize when testing and on custodian crypto wallet application and why? Can you describe a real vulnerability you found in web application, opaque, how web impact and how you help me to fix it. How do you decide whether a bad boundary report is critical heights, medium low severity.";

        assert_eq!(
            normalize_appsec_terms(text),
            "Security assessment of crypto wallet backend and API before a major release. What API vulnerabilities would you prioritize when testing a non-custodial crypto wallet application and why? Can you describe a real vulnerability you found in a web application or API, how you proved impact, and how you helped to fix it. How do you decide whether a bug bounty report is critical, high, medium, or low severity."
        );
    }

    #[test]
    fn waf_and_api_interview_questions_are_normalized_after_stt() {
        let text = "In this to gauge whether I love rule, he is blocking leg team users or only malicious traffic. How old do you build security code and training for back end developers who work with Abyss? To integrate SAS into a CS and you without blocking every match. Request. How old do you tune in above her rule that Melox and mobile IP traffic. How do you taste my mobile IP traffic for after two authorization and for And follow flows. Why wall three tests were there an API endpoint? Clicks sensitive wallet metadata throughout a xsife.expo exp exp exp. I will suit this weather cause an exploitable riser that just misconfigurate. Oh, hold to your comfy clothes. Api shield. She's having validation. And what traffic vault you put into lock mode before unlocking.";

        assert_eq!(
            normalize_appsec_terms(text),
            "How would you gauge whether a WAF rule is blocking legitimate users or only malicious traffic. How would you build secure coding training for backend developers who work with APIs? How would you integrate SAST into CI/CD without blocking every merge request. How would you tune a WAF rule that blocks legitimate mobile API traffic. How do you test deep links and universal links for account takeover risks. What would you test when an API endpoint leaks sensitive wallet metadata through XSS exposure. How would you decide whether this is an exploitable risk or just a misconfiguration. How would you configure Cloudflare API Shield schema validation, and what traffic would you put into log mode before blocking."
        );
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn set_nonblocking(ws: &mut DeepgramWebSocket) -> Result<()> {
    match ws.get_mut() {
        MaybeTlsStream::Plain(s) => s.set_nonblocking(true).context("set_nonblocking (plain)")?,
        MaybeTlsStream::NativeTls(s) => s
            .get_ref()
            .set_nonblocking(true)
            .context("set_nonblocking (tls)")?,
        _ => warn!("Unknown stream type, non-blocking not set"),
    }
    Ok(())
}
