# 셀프호스트 폰트

공개 CDN 배포본이 없어 직접 넣어야 하는 폰트를 두는 곳입니다.
파일을 여기 떨어뜨리면 `css/style.css` 상단의 `@font-face`가 자동으로 집어갑니다.

| 파일명 | 폰트 | 쓰이는 곳 | 받는 곳 |
|---|---|---|---|
| ~~`GanaChocolate.woff2`~~ | 가나초콜릿체 | RETRO 포인트 (CDN woff 로 전환 완료, local() 우선) | [눈누](https://noonnu.cc) |
| ~~`DungGeunMo.woff2`~~ | 둥근모꼴+ Fixedsys | RETRO 디스플레이 (CDN woff 로 전환 완료) | [눈누](https://noonnu.cc) |

## 넣는 방법

1. 눈누에서 폰트를 내려받습니다 (ttf/otf).
2. [woff2 변환기](https://cloudconvert.com/ttf-to-woff2) 등으로 `.woff2`로 바꿉니다.
3. 위 표의 파일명 그대로 이 폴더에 넣습니다.
4. `css/style.css`에서 해당 `@font-face`의 주석 처리된 `url(...)` 줄을 살립니다.
5. `index.html`의 `?v=` 숫자를 올려 캐시를 무효화합니다.

## 왜 CDN을 안 쓰나

`가나초콜릿체`와 `둥근모꼴+ Fixedsys`는 jsdelivr(눈누·webfontworld 미러 포함)에
올라와 있지 않아 확인했습니다. Paperlogy와 Galmuri11은 CDN에 있어 그대로 링크합니다.

## 라이선스

두 폰트 모두 상업적 이용까지 무료지만 **재배포 조건이 다릅니다.**
저장소에 폰트 파일을 커밋하기 전에 각 배포처의 라이선스 전문을 확인하세요.
