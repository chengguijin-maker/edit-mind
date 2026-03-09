<!-- MANUAL: -->

## Onboarding Flow

```mermaid
flowchart TB
    FirstVisit[First Visit] -->|Show| Welcome[Welcome Screen]
    Welcome -->|Next| Intro[Feature Introduction]
    Intro -->|Next| Tutorial[Interactive Tutorial]
    Tutorial -->|Complete| Skip[Skip Option]
    Tutorial -->|Finish| Main[Main App]
    Skip -->|Direct| Main
```