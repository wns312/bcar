# 🚗 B Car Automation

## 스크래핑의 위법여부?
계약한 홈페이지 내에서 정보를 수집하여 광고 업로드에 활용하기 때문에 위법하지 않습니다.

## 프로젝트 개요

기존 업체를 통해 비용을 지불하고 이용하던 차량 업로드 서비스를 대체하기 위해 개발된 서비스입니다.

판매차량 필터링 및 업로드 자동화를 수행합니다.

#### 스프레드 시트 (계정, 업로드 필터링, URL, 마진 설정)

> 빈번한 수정및 관리 필요한 부분은 스프레드 시트로 관리합니다.

<img src="https://github.com/wns312/bcar/assets/61006711/ec5cba61-1991-45aa-958d-07bafba65142">

#### 데이터 수집 & 업로드 예시

<img src="https://github.com/wns312/bcar/assets/61006711/bb9b454a-c9cb-4383-86a7-e86f74d01e0c">



---

# 아키텍처

<img src="https://github.com/wns312/bcar/assets/61006711/91ed2c27-1223-4906-9307-44a7da8c02d2" />



## 사용기술
### 프로그래밍 언어
> `Node.js` `TypeScript`

### AWS 서비스
>  `Batch`  `ECR(Elastic Container Registry)` `Secrets Manager`
>
> `Event Bridge` `SNS(Simple Notification Service)` 

### 데이터 관리
>  `DynamoDB`  `Spread Sheet`

### CI/CD
>  `Docker` `Github Actions`

### 작업 & 이슈 관리

> `JIRA(현재는 링크 해제되었음)`




## 각 서비스에 대한 간략 설명

#### Batch

> ECR의 이미지를 pull 후 실제 작업을 수행하는 주체

#### Event Bridge

> Batch jobs를 cron 설정에 따라 실행

#### DynamoDB & SpreadSheet

> SpreadSheet: 업로드 계정, URL, 마진 관리 / 업로드 될 차량 비율 및 카테고리 설정

> DynamoDB: 판매차량 데이터 수집 & 보관

#### Secrets Manager

> 환경변수 & 민감한 정보  관리(API keys,  ...etc)

#### Github Actions

> 이미지 빌드 후 ECR private respository에 푸시

---
### MySQL이나 PostgreSQL과 같은 RDBMS를 사용하지 않은 이유는?
일반적인 서비스에서 DB가 차지하는 비용이 상당하다는 것을 알고있고, 소규모 프로젝트에서 사용하기에는 적합하지 않다고 생각했습니다. 

추후 cafe24와 같이 비용이 저렴한 가상 리눅스 서버를 대여해 직접 RDBMS를 설치, 관리하는 것을 고려하고 있습니다.
