# 딥러닝 기반 ai 두피 관리 서비스

두피 사진 1~3장을 업로드하면 제공된 PyTorch 모델 4개를 실행합니다. Flask API와 기존 HTML/CSS/JavaScript 웹을 같은 주소에서 제공합니다.

**실제 가중치 로드와 추론은 연결됐습니다. 사용자가 지정한 등급표에 따라 정상·경증·중증으로 표시합니다. 학습 당시 전처리·DINO 특징 결합은 아직 미확인이므로, 결과는 현재 추론 설정에서 계산한 관찰 참고용입니다.**

## 실행

현재 PC에는 프로젝트 `.venv`에 의존성이 설치돼 있습니다. `start.cmd`를 더블클릭하거나 이 폴더의 PowerShell에서 실행하세요.

~~~powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
~~~

브라우저 주소: **http://127.0.0.1:8000**

**사진 준비 → 사진 선택 → 확인 후 분석** 순서로 안내합니다. 촬영 안내를 확인하고 JPG/PNG/WEBP 사진을 1~3장 고른 뒤, 마지막 확인 화면에서 **사진 N장 분석하기**를 누르세요. 여러 장 선택과 끌어 놓기를 지원하며, 분석 버튼을 누르기 전에는 사진을 전송하지 않습니다. 단계 사이를 이동하거나 분석이 실패해도 선택한 사진은 유지됩니다.

결과 화면과 사진별 표에는 **정상·경증·중증**을 표시하며 비율 수치는 노출하지 않습니다. **사진별 등급 자세히 보기**에서 사진마다 나온 등급을 확인하세요. **오늘의 결과 저장하기**를 누르면 같은 브라우저의 **내 기록**에서 다시 열 수 있습니다. 기록 그래프의 y축도 세 등급입니다. 이전 테스트용 대시보드와 사이드바는 새 UI로 교체했습니다.

`dist/index.html` 직접 열기, Live Server, `python -m http.server`는 AI 서버를 실행하지 않습니다. 정적 HTML만 다른 PC로 전달해도 AI는 실행되지 않습니다. 새 PC에서는 Python 3.11~3.14와 모델 파일을 준비하고 최초 한 번 설치합니다.

~~~powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
~~~

설치는 별도 가상환경에 CPU용 PyTorch/torchvision과 `requirements.txt`를 설치하며, 모델을 다운로드하지 않습니다. 포트 변경: `start.ps1 -Port 8001`. 종료: 서버 터미널 Ctrl+C. 기본 접속 범위는 이 PC뿐입니다.

## 모델 위치

| 항목 | 가중치 | 확인된 구조 | 출력 수 |
|---|---|---|---:|
| 각질 | `7_4level_fold0_각질.pth` | DINOv3 ViT-B/16 + 1536차원 head | 4 |
| 피지과다 | `best_v3_피지과다.pth` | DINOv3 ViT-B/16 + 1536차원 head | 3 |
| 탈모 여부 | `best_model_v11_augment_탈모.pth` | EfficientNet-B4 | 3 |
| 모낭사이홍반 | `FINAL_3CLASS_p010_fold0_모낭사이홍반.pth` | DINOv2 ViT-B/14 + 1536차원 head | 3 |

검색 순서: `SCALP_MODEL_DIR` 환경변수 → 이 프로젝트의 `models/`(4개 모두 있을 때) → 사용자 `Downloads/scalp_4indicator_models`. 현재 다운로드 폴더 원본을 읽으며 모델을 저장소에 복사하지 않습니다.

~~~powershell
$env:SCALP_MODEL_DIR = 'D:\scalp_models'
powershell -ExecutionPolicy Bypass -File .\start.ps1
~~~

`torch.load(weights_only=True)`와 `load_state_dict(strict=True)`를 사용합니다. 누락된 가중치나 로드 실패 시 분석을 차단합니다. 실패를 예시 결과로 대체하지 않습니다.

## 학습 설정 확인 후 수정

`model_config.json`이 설정 원본입니다. .pth에는 클래스 이름이나 전처리 설정이 없습니다. 표시 등급은 사용자 확인 내용을 설정에 기록했으며, 가중치 모양 일치만으로 학습 당시 forward와 동일함을 증명하지 못합니다.

### 사용자 확인 등급표

| 모델 | 원시 클래스 → 표시 등급 | 최종 선택 후보 |
|---|---|---|
| 각질 | 1 → 정상, 2 → 경증, 3 → 중증 | 1·2·3 (0 제외) |
| 피지과다·탈모 여부·모낭사이홍반 | 0 → 정상, 1 → 경증, 2 → 중증 | 0·1·2 |

각질은 **0번 확률이 가장 높아도** 이를 선택 후보에서 제외하고 1~3 중 가장 높은 값을 선택합니다. 0번을 정상에 합치거나 네 확률을 다시 정규화하지 않습니다. 원시 확률은 내부 계산과 기존 기록 호환용으로만 보관합니다.

`labels_confirmed`는 표시 등급표 확인, `settings_verified`는 학습 전처리·forward 전체 확인을 뜻하는 별도 상태입니다. 현재 등급표는 확인됐지만 학습 전처리가 미확인이므로 `settings_verified`는 false입니다.

| 설정 | 현재 임시값 | 확인할 내용 |
|---|---|---|
| 각질·피지 입력 | 짧은 변 256 → 중앙 crop 256 | 학습 transform의 크기·crop·보간법 |
| 홍반 입력 | 짧은 변 392 → 중앙 crop 392 | 저장된 위치 임베딩은 28×28 격자. 학습 transform은 미확인 |
| 탈모 입력 | 짧은 변 384 → 중앙 crop 380 | 상류 기본값이며 학습 transform은 미확인 |
| 정규화 | ImageNet mean/std, bicubic | 실제 모델별 정규화·보간법 |
| DINO 특징 | CLS 다음 patch 평균 연결 (`cls_mean`) | 결합 순서·정규화·register token 취급 |
| DINO head | LayerNorm → Identity → Linear | 중간이 Dropout이면 eval 시 Identity와 동일하나 활성화 여부는 미확인 |
| 클래스 | 위 사용자 확인 등급표 적용 | 학습 코드 확보 시 label index도 대조 |

`pooling`: `cls_mean` 또는 `mean_cls`. `head_activation`: `identity`, `gelu`, `relu`. 학습 코드가 다르면 `inference.py`의 forward/head/transform도 실제 구현에 맞춰 수정해야 합니다.

클래스 이름은 `labels`, 등급 순서는 `grade_indices`(정상=0, 경증=1, 중증=2), 제외할 원시 출력은 `excluded_classes`에 기록합니다. 사용자 확인 매핑에는 `labels_confirmed: true`를 사용합니다. 전처리와 forward까지 확인했을 때만 `settings_verified: true`로 설정하세요. 설정 변경 후 서버 재시작이 필요합니다. 기존 저장 기록을 표시하는 `dist/app.js`의 `CLASS_GRADE_MAP`도 같은 등급표를 유지해야 합니다.

상류 기본 설정 참고: [DINOv3 모델 설정](https://huggingface.co/timm/vit_base_patch16_dinov3.lvd1689m/blob/main/config.json), [EfficientNet-B4 공식 문서](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.efficientnet_b4.html). 이 자료는 사용자 학습 설정의 증거가 아닙니다.

## 결과·저장

- 사진마다 logits에 softmax를 적용합니다. 여러 사진은 **클래스별 점수 평균**을 구하고 제외 클래스를 뺀 후보 중 최댓값을 선택하여 표시 등급으로 변환합니다. 이번 변경은 표시 등급과 각질 0번 제외를 적용한 것으로, 기획서의 3장 중앙값 규칙으로 전환하지 않았습니다.
- 내부 모델 점수는 보정된 질환 확률이나 정확도가 아니며 화면에는 표시하지 않습니다. 실제 두피 사진과 정답으로 성능을 평가한 상태가 아닙니다.
- 장당 최대 10MiB, 최대 3장, 장당 최대 2,000만 화소. 서버에서도 실제 이미지 형식과 디코딩을 검사합니다.
- 사진은 서버 메모리에서만 처리합니다. Flask multipart와 Waitress 버퍼의 임시파일 저장을 막았습니다. 사진·원본 파일명은 기록에 저장하지 않습니다.
- 날짜·원시 클래스별 값·사진별 출력·등급 매핑 정보·모델/설정 식별자를 localStorage `scalp-ai-model-records-v2`에 저장합니다. 기존 원시 기록을 삭제하거나 덮어쓰지 않고, 화면에서 같은 확인 등급표로 표시합니다. 과거 각질 0번 기록도 보관된 1~3번 값으로 표시 등급을 다시 계산합니다. 다른 PC·브라우저와 공유되지 않습니다.
- 그래프는 동일 모델/설정의 실제 기록을 선택 월 또는 최근 7일로 조회합니다. y축은 정상·경증·중증이며, 확인할 수 없는 값은 점이나 연결선으로 그리지 않습니다.

## 변경 전 백업

저장소 루트의 `backups/scalp-ai-before-grades-20261031-181358.zip`에 변경 직전 소스·설정 22개 파일과 SHA256 매니페스트를 보관했습니다. ZIP 안의 각 파일이 변경 전 작업 파일과 바이트 단위로 같은지 검증했습니다. 모델 가중치·가상환경·브라우저 저장 데이터는 이 소스 백업에 포함하지 않으며, 모델 원본과 기존 브라우저 기록은 수정하지 않았습니다.

## 구성·API

| 파일/주소 | 역할 |
|---|---|
| `server.py` | 웹 제공, 업로드 검사, API 오류 처리 |
| `inference.py` | 모델 로드·전처리·실제 추론·종합 |
| `model_config.json` | 클래스 매핑과 전처리/forward 설정 |
| `dist/` | 기존 디자인을 유지한 웹 |
| `GET /api/health` | loading/ready/error, 모델별 상태 |
| `POST /api/analyze` | multipart의 `photos` 필드 1~3개 |
| `tests/test_api.py` | 업로드·오류·종합 계산 테스트 |

모델 준비 전 503, 동시 분석 중 429, 잘못된 사진 400, 용량 초과 413을 반환합니다. 웹은 분석 중 입력 변경·중복 요청을 막고 180초 제한과 재시도를 제공합니다. 실패 원인은 서버 로그에서 확인합니다. CPU 기본 스레드는 최대 4개이며 `SCALP_THREADS`로 변경할 수 있습니다.

## 검증

~~~powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --check dist\app.js
~~~

서버를 실행한 상태에서 실제 가중치를 사용하는 브라우저 검증:

~~~powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe scripts\smoke_web.py
~~~

Chrome/Edge headless와 **합성 이미지**로 업로드 → 실제 4모델 추론 → 결과 일치 → 저장·새로고침·재조회 → 오류 처리를 확인합니다. 합성 이미지 결과는 두피 상태나 모델 정확도를 검증하는 자료가 아닙니다. 스크린샷은 `test-results/`에 저장합니다. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`로 브라우저 경로를 지정할 수 있습니다.
