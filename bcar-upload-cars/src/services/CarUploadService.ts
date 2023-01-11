import { existsSync } from 'node:fs';
import { mkdir, rm } from "fs/promises"
import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { BrowserInitializer, CarClassifier, CarUploader } from "../puppeteer"
import { AccountSheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "../db"
import { CarDataObject, CarDetailModel, CarModel, CarSegment, CarManufacturer, ManufacturerOrigin, UploadSource } from "../types"

export class CarUploadService {
  constructor(
    private sheetClient: AccountSheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoCategoryClient: DynamoCategoryClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private initializer: BrowserInitializer,
  ) {}

  // uploadCars 빼고 전부 이동되어야 할 메소드
  static createCarObject(items: Record<string, AttributeValue>[]): CarDataObject[] {
    return items.map(item=>{
      return {
        PK: item.PK.S!,
        SK: item.SK.S!,
        carCheckSrc: item.CarCheckSrc.S!,
        modelYear: item.ModelYear.S!,
        presentationsDate: item.PresentationsDate.S!,
        displacement: item.Displacement.S!,
        mileage: item.Mileage.S!,
        carImgList: item.CarImgList ? item.CarImgList.SS! : [],
        hasMortgage: item.HasMortgage.BOOL!,
        hasSeizure: item.HasSeizure.BOOL!,
        title: item.Title.S!,
        fuelType: item.FuelType.S!,
        carNumber: item.CarNumber.S!,
        registerNumber: item.RegisterNumber.S!,
        presentationNumber: item.PresentationNumber.S!,
        price: Number.parseInt(item.Price.N!),
        hasAccident: item.HasAccident.S!,
        gearBox: item.GearBox.S!,
        color: item.Color.S!,
        company: item.Company.S!,
        category: item.Category.S!,
      }
    })
  }

  private createSegmentMap(items: Record<string, AttributeValue>[]): Map<string, CarSegment> {
    const segmentMap = new Map<string, CarSegment>()
    items.reduce((map, item)=>{
      return map.set(item.name.S!, {
        name: item.name.S!,
        value: item.value.S!,
        index: Number.parseInt(item.index.N!),
      })
    }, segmentMap)
    return segmentMap
  }

  private createCompanyMap(items: Record<string, AttributeValue>[]): Map<string, CarManufacturer> {
    const manufacturerMap = new Map<string, CarManufacturer>()
    items.reduce((map, item)=>{
      return map.set(item.name.S!, {
        origin: item.origin.S! === "DOMESTIC" ? ManufacturerOrigin.Domestic : ManufacturerOrigin.Imported,
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
        carModelMap: new Map<string, CarModel>()
      })
    }, manufacturerMap)
    return manufacturerMap
  }

  private fillCarModelMap(
    companyMap: Map<string, CarManufacturer>, items: Record<string, AttributeValue>[]
  ): Map<string, CarManufacturer> {

    items.reduce((map, item)=>{
      const carManufacturer = map.get(item.company.S!)
      if (!carManufacturer) {
        console.log(item.company.S!);
        throw new Error("There is no proper carModelMap")
      }
      const detailModels: CarDetailModel[] = []
      let carModelName = item.name.S!
      carModelName = carModelName === "봉고화물" ? "봉고" : carModelName
      carModelName = carModelName === "e-마이티" ? "마이티" : carModelName
      carModelName = carModelName === "캡처" ? "캡쳐" : carModelName
      carManufacturer.carModelMap.set(carModelName, {
        carSegment: item.segment.S!,
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
        detailModels
      })
      return map
    }, companyMap)
    return companyMap
  }

  private fillCarDetails(
    companyMap: Map<string, CarManufacturer>, items: Record<string, AttributeValue>[]
  ): Map<string, CarManufacturer> {

    items.reduce((map, item)=>{
      const carManufacturer = map.get(item.company.S!)
      if (!carManufacturer) {
        console.log(item.company.S!);
        throw new Error("There is no proper carModelMap")
      }

      let carModelName = item.SK.S!.replace("#MODEL-", "")
      carModelName = carModelName === "봉고화물" ? "봉고" : carModelName
      carModelName = carModelName === "e-마이티" ? "마이티" : carModelName
      carModelName = carModelName === "캡처" ? "캡쳐" : carModelName
      const carModel = carManufacturer.carModelMap.get(carModelName)
      if (!carModel) {
        console.log(carModelName);
        throw new Error("There is no proper carModel")
      }

      carModel.detailModels!.push({
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
      })
      return map
    }, companyMap)
    // index 순서로 detail 재정렬

    companyMap.forEach(company=>{
      company.carModelMap.forEach(model=>{
        model.detailModels = model.detailModels!.sort((a, b)=>{
          return a.index - b.index
        })
      })
    })
    return companyMap
  }

  private async initializeMaps() {
    const segmentResult = await this.dynamoCategoryClient.scanSegment()
    const segmentMap = this.createSegmentMap(segmentResult)
    const companyResult = await this.dynamoCategoryClient.scanCompany()
    const companyMap = this.createCompanyMap(companyResult)

    const carModelResult = await this.dynamoCategoryClient.scanModel()
    await this.fillCarModelMap(companyMap, carModelResult)

    const carDetailResult = await this.dynamoCategoryClient.scanDetailModel(2)
    this.fillCarDetails(companyMap, carDetailResult)
    return {
      segmentMap,
      companyMap
    }
  }

  // 작업 전, 후로 DB를 조회해서 이미 등록된 차량, 마감된 차량에 대한 처리를 해야한다.
  // 10개까지 사용한 경우에 ip가 차단되었음. (하나의 ip에서의 과도한 트래픽 발생이 가장 중요한 원인. max browser 3~5개)
  // 차량을 더이상 등록할 수 없는 경우 위의 이벤트 리스너를 통해서 실행을 종료한다.
  // 이 경우에도 차량 등록 내용을 갱신해주어야 한다.
  async uploadCars(loginUrl: string, registerUrl: string, workerAmount: number, carAmount: number) {
    console.log("데이터 조회 시작");
    const result = await this.dynamoCarClient.scanCar()  // 여기가 되게 오래 걸림
    // let result = await this.dynamoCarClient.segmentScan(10)

    const { id: testId, pw: testPw } = await this.sheetClient.getTestAccount()
    const { segmentMap, companyMap } = await this.initializeMaps()  // 여기도 약간 오래걸림

    console.log("차량 객체 생성 및 분류 시작");
    const cars = CarUploadService.createCarObject(result.slice(0, carAmount))
    const carClassifier = new CarClassifier(cars, segmentMap, companyMap)
    const classifiedCars = carClassifier.classifyAll()

    // 작업 순서
    // 0. 모든 아이디에 대해 다음 동작을 수행한다.
    // 1. 모든 업로드 된 차량을 검사해서 마감된 차량을 뺀다.
    // 2. DB의 업로드 데이터에서 마감 된 차량을 모두 제거한다.
    // 3. 모든 차량 중에서 마감된 차량을 제거했으므로, 새로 모든 업로드된 차량을 조회한다.
    // 4. 업로드가 되지 않은 차량을 걸러낸다
    // 5. 업로드가 되지 않은 차량들을 업로드한다.

    const rootDir = CarUploader.getImageRootDir(testId)
    if(!existsSync(rootDir)) {
      await mkdir(rootDir)
    }

    const sourceMapObj = {
      succeededSourceMap: new Map<string, UploadSource[]>(),
      failedSourceMap: new Map<string, UploadSource[]>()
    }

    console.log(`브라우저 페이지 초기화 : ${workerAmount}`);
    await this.initializer.initializeBrowsers(workerAmount)

    console.log("차량 업로드");
    try {
      const carUploderResult = this.initializer.pageList.map(async (page, index)=>{
        console.log(index*200, index*200 + 200);
        await this.initializer.login(page, loginUrl + registerUrl, testId, testPw)
        await this.initializer.activateEvents(page)

        return new CarUploader(
          page,
          testId,
          registerUrl,
          classifiedCars.slice(index*200, index*200 + 200),
        ).uploadCars()
      })
      // 이렇게 처리되면 중간에 아예 에러나는 경우에 업데이트를 못하게 될 수도 있음.
      // 예를 들어 page에러가 발생해서 브라우저가 아예 꺼져버리는 경우
      // 천천히 생각해보자 우선 업로드 로직부터 짜자
      const uploadResults = await Promise.all(carUploderResult)
      // id별 분류가 이루어지는 것이 맞다

      uploadResults.reduce(({ succeededSourceMap, failedSourceMap }, {id, succeededSources, failedSources})=>{
        let existingSucceededSources = succeededSourceMap.get(id)
        let existingFailedSources = failedSourceMap.get(id)
        existingSucceededSources = existingSucceededSources ? existingSucceededSources : []
        existingFailedSources = existingFailedSources ? existingFailedSources : []
        if (succeededSources.length) {
          succeededSourceMap.set(id, [ ...existingSucceededSources , ...succeededSources])
        }
        if (failedSources.length) {
          failedSourceMap.set(id, [ ...existingFailedSources , ...failedSources])
        }
        return {
          succeededSourceMap,
          failedSourceMap
        }
      }, sourceMapObj)

      const succeededSourceIds = Array.from(sourceMapObj.succeededSourceMap.keys())
      for (const id of succeededSourceIds) {
        const sources = sourceMapObj.succeededSourceMap.get(id)
        const responses = await this.dynamoUploadedCarClient.batchSave(id, sources!)
        responses.forEach(r=>{
          console.log(r);
        })
      }

      // 실패 차량에 대한 분석 및 추후 처리가 필요하기 때문
      // const failedSourceIds = Array.from(sourceMapObj.failedSourceMap.keys())

    } catch(e) {
      throw e
    } finally {
      console.log(sourceMapObj);
      await rm(rootDir, { recursive: true, force: true })
    }
  }
}
