# B-Car

## 프로젝트 개요

> 판매 차량 필터링 & 광고 업로드 자동화 서비스
>
> (서비스 예시 영상 또는 gif 첨부 예정)
>
> (spreadsheet 이미지와 실제 실행 영상)






## 사용기술
### 개발언어
`TypeScript`
### AWS 서비스
`Batch`  `ECR(Elastic Container Registry)` `Secrets Manager` `DynamoDB`

`Event Bridge` `SNS(Simple Notification Service)` 

### Google 서비스
`Spread Sheet`

### CI/CD
`Docker` `Github Actions`

### 작업 & 이슈 관리

`JIRA(현재는 링크 해제되었음)`





# 아키텍처

<img src="https://github.com/wns312/bcar/assets/61006711/91ed2c27-1223-4906-9307-44a7da8c02d2" />

## 각 서비스에 대한 간략 설명

#### Batch

- ECR의 이미지를 pull 후 실제 작업을 수행하는 주체

#### Event Bridge

- Batch jobs를 cron 설정에 따라 실행

#### DynamoDB & SpreadSheet

- SpreadSheet: 업로드 계정, URL, 마진 관리 / 업로드 될 차량 비율 및 카테고리 설정

- DynamoDB: 판매차량 데이터 수집 & 보관

#### Secret Manager

- 환경변수 & 민감한 정보  관리(API keys,  ...etc)

#### Github Actions

- 이미지 빌드 후 ECR private respository에 푸시

