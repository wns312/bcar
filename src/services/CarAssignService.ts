import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, Car, UploadedCar } from "../entities"
import { Company, Origin, Segment, UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk } from "../utils"

export class CarAssignService {

  static IMPORT_MAX_COUNT = 20
  static LARGE_TRUCK_MAX_COUNT = 20
  static BONGO_PORTER_MAX_COUNT = 30

  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}

    private async getUnregisteredCars() {
    // [A, B]
    const [cars, uploadedCars] = await Promise.all([
      this.dynamoCarClient.queryCars(),
      this.dynamoUploadedCarClient.queryAll()
    ])
    console.log("rawCars: ", cars.length)
    console.log("rawuploadedCars: ", uploadedCars.length)

    const carMap = new Map<string, Car>(cars.map(car=>[car.carNumber, car]))
    const uploadedCarMap = new Map<string, UploadedCar>(uploadedCars.map(car=>[car.carNumber, car]))

    // A - B: 등록이 될 대상
    const unregisteredCars = cars.filter(car=>!uploadedCarMap.get(car.carNumber))
    // B - A: 삭제가 될 대상.
    const uploadedCarShouldBeDeleted = uploadedCars.filter(car=>!carMap.get(car.carNumber))

    if (uploadedCarShouldBeDeleted.length) {
      // Delete
      console.log(uploadedCarShouldBeDeleted.map(car => car.carNumber))
      const deleteResponses = await this.dynamoUploadedCarClient.batchDelete(uploadedCarShouldBeDeleted)
      console.log("Delete result: ")
      deleteResponses.forEach(r => {
        if (r.$metadata.httpStatusCode !== 200) {
          console.log(r)
        }
      })
    }

    // Convert to CarObject and return
    return unregisteredCars
  }

  async assign(id: string, carNumbers: string[]) {
    const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, carNumbers, false)
    responses.forEach(response=> {
      if (response.$metadata.httpStatusCode !== 200) {
        console.log(response)
      }
    })
    return carNumbers
  }

  private filterSources(classifiedSources: UploadSource[]) {
    // 1. 수입차 200대
    const importedSources = classifiedSources
      .filter(source=>source.origin === Origin.Imported)

    // 2. 화물/특장 총 500대 (포터 봉고 300대, 대형화물 200대)
    const domesticSources = classifiedSources.filter(source=>source.origin === Origin.Domestic)
    const hksCars = domesticSources.filter(source=>
      source.company.name === '현대'
      || source.company.name === '기아'
      || source.company.name === '삼성'
    )

    // 2-1. 봉고포터
    const bongoPorterSources = hksCars.filter(source=>
      source.car.title.includes('봉고')
      || source.car.title.includes('포터')
    )
    const bongoPorterSourceMap = new Map<string, UploadSource>(
      bongoPorterSources.map(source=>[source.car.carNumber, source])
    )

    // 2-2. 대형화물
    const bigTonCars = domesticSources.filter(source=>
      source.car.title.includes('톤')
      && !source.car.title.includes('1톤')
      && !source.car.title.includes('1.2톤')
      && !source.car.title.includes('1.4톤')
    )
    const hyundaiCars = hksCars.filter(source=>
      source.car.title.includes('덤프')
      || source.car.title.includes('마이티')
      || source.car.title.includes('메가트럭')
      || source.car.title.includes('에어로')
      || source.car.title.includes('카운티')
    )
    const kiaCars = hksCars.filter(source=>
      source.car.title.includes('그랜버드')
      || source.car.title.includes('라이노')
      || source.car.title.includes('복사')
      || source.car.title.includes('봉고화물')
      || source.car.title.includes('세레스')
      || source.car.title.includes('콤보')
      || source.car.title.includes('타이탄')
      || source.car.title.includes('트레이드')
      || source.car.title.includes('파맥스')
    )

    const samsungCars = hksCars.filter(source=>source.car.title.includes('르노마스터'))
    // 봉고(포터)덤프(현대, 기아)의 경우 Big에도 걸리고, 봉고포터에도 걸리므로 봉고 포터에 포함하고
    // largeTruckSources에서만 제거해준다.
    const largeTruckSources = Array.from(
      [...bigTonCars, ...hyundaiCars, ...kiaCars, ...samsungCars].reduce(
        (map, source)=>map.set(source.car.carNumber, source),
        new Map<string, UploadSource>()
      ).values()
    ).filter(source=>!bongoPorterSourceMap.get(source.car.carNumber))

    // 봉고와 해당 차량을 제거한 domesticCarMap
    const domesticCarMap = new Map<string, UploadSource>(
      domesticSources.map(source=>[source.car.carNumber, source])
    )
    largeTruckSources.forEach(source => { domesticCarMap.delete(source.car.carNumber) })
    bongoPorterSources.forEach(source => { domesticCarMap.delete(source.car.carNumber) })

    return {
      importedSources,
      bongoPorterSources,
      largeTruckSources,
      domesticSources: Array.from(domesticCarMap.values())
    }
  }

  private async queryRegionSources(segmentMap: Map<string, Segment>, companyMap: Map<string, Company>, accounts: Account[]) {
    let regionSources: UploadSource[] = []
    let accountAssignAmountMap = new Map<string, number>()
    for (const account of accounts) {
      const accountUploadCars = await this.dynamoUploadedCarClient.queryById(account.id)
      const accountUploadedCarNumbers = accountUploadCars.map(car=>car.carNumber)
      accountAssignAmountMap.set(account.id, account.uploadAmount - accountUploadedCarNumbers.length)
      if (!accountUploadedCarNumbers.length) continue
      const accountCars = await this.dynamoCarClient.QueryCarsByCarNumbers(accountUploadedCarNumbers)
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      regionSources = regionSources.concat(acccountSources)
    }
    return {
      regionSources,
      accountAssignAmountMap,
    }
  }

  private calculateExceededAmount(
    totalAmountShouldAssign: number,
    regionImportedSourcesLength: number,
    regionLargeTruckSourcesLength: number,
    regionBongoPorterSourcesLength: number,
    regionDomesticSourcesLength: number,
  ) {
    const assignableDomesticCarAmount = totalAmountShouldAssign
    - CarAssignService.IMPORT_MAX_COUNT
    - CarAssignService.LARGE_TRUCK_MAX_COUNT
    - CarAssignService.BONGO_PORTER_MAX_COUNT

  const regionImportedCarAmountShouldDelete =
    regionImportedSourcesLength > CarAssignService.IMPORT_MAX_COUNT
    ? regionImportedSourcesLength - CarAssignService.IMPORT_MAX_COUNT
    : 0
  const regionLargeTruckCarAmountShouldDelete =
    regionLargeTruckSourcesLength > CarAssignService.LARGE_TRUCK_MAX_COUNT
    ? regionLargeTruckSourcesLength - CarAssignService.LARGE_TRUCK_MAX_COUNT
    : 0
  const regionBongoPorterCarAmountShouldDelete =
  regionBongoPorterSourcesLength > CarAssignService.BONGO_PORTER_MAX_COUNT
    ? regionBongoPorterSourcesLength - CarAssignService.BONGO_PORTER_MAX_COUNT
    : 0
  const regionDomesticCarAmountShouldDelete =
    regionDomesticSourcesLength > assignableDomesticCarAmount
    ? regionDomesticSourcesLength - assignableDomesticCarAmount
    : 0
    return {
      regionImportedCarAmountShouldDelete,
      regionLargeTruckCarAmountShouldDelete,
      regionBongoPorterCarAmountShouldDelete,
      regionDomesticCarAmountShouldDelete
    }
  }

  // TODO
  // 일반차량의 대수가 초과해서 삭제를 했지만, 특수차량의 개수가 부족해서 다시 할당해야 하는경우 불필요한 삭제 및 재할당 발생
  async releaseAssignedCars(segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const accountRegionMap = await this.sheetClient.getAccountRegionMap()
    console.log("=============================================================")

    for (const [region, accounts] of accountRegionMap) {
      const totalAmountShouldAssign = accounts.reduce((total, account)=> total + account.uploadAmount, 0)
      const { regionSources } = await this.queryRegionSources(segmentMap, companyMap, accounts)

      // 현재 실제 할당된 카테고리별 개수
      const {
        importedSources: regionImportedSources,
        largeTruckSources: regionLargeTruckSources,
        bongoPorterSources: regionBongoPorterSources,
        domesticSources: regionDomesticSources,
      } = this.filterSources(regionSources)

      // 초과량에 대한 계산
      const {
        regionImportedCarAmountShouldDelete,
        regionLargeTruckCarAmountShouldDelete,
        regionBongoPorterCarAmountShouldDelete,
        regionDomesticCarAmountShouldDelete,
      } = this.calculateExceededAmount(
        totalAmountShouldAssign,
        regionImportedSources.length,
        regionLargeTruckSources.length,
        regionBongoPorterSources.length,
        regionDomesticSources.length,
      )

      // 초과량만큼의 차량 분리
      const splicedRegionImportedSources = regionImportedSources.splice(
        regionImportedSources.length-regionImportedCarAmountShouldDelete
      )
      const splicedRegionLargeTruckSources = regionLargeTruckSources.splice(
        regionLargeTruckSources.length-regionLargeTruckCarAmountShouldDelete
      )
      const splicedRegionBongoPorterSources = regionBongoPorterSources.splice(
        regionBongoPorterSources.length-regionBongoPorterCarAmountShouldDelete
      )
      const splicedRegionDomesticSources = regionDomesticSources.splice(
        regionDomesticSources.length-regionDomesticCarAmountShouldDelete
      )

      // 초과된 종류별 차량의 차량 번호들
      const deleteTargetCarNumbers = splicedRegionImportedSources
        .concat(splicedRegionLargeTruckSources)
        .concat(splicedRegionBongoPorterSources)
        .concat(splicedRegionDomesticSources)
        .map(source=>source.car.carNumber)

      console.log(`${region} 지역에 할당되어야 할 차량의 총량: ${totalAmountShouldAssign}`)
      const assignableDomesticCarAmount = totalAmountShouldAssign
      - CarAssignService.IMPORT_MAX_COUNT
      - CarAssignService.LARGE_TRUCK_MAX_COUNT
      - CarAssignService.BONGO_PORTER_MAX_COUNT
      console.log("할당 되어야 할 지역별 일반차량 대수:", assignableDomesticCarAmount)
      console.log(`${region} 지역에 현재 할당된 차량의 총량: ${regionSources.length}`)
      console.log(
        "현재 할당된 수입, 대형트럭, 소형트럭, 일반차량 대수: ",
        regionImportedSources.length,
        regionLargeTruckSources.length,
        regionBongoPorterSources.length,
        regionDomesticSources.length
      )
      console.log(
        "삭제 되어야 할 수입, 대형트럭, 소형트럭, 일반차량 대수: ",
        regionImportedCarAmountShouldDelete,
        regionLargeTruckCarAmountShouldDelete,
        regionBongoPorterCarAmountShouldDelete,
        regionDomesticCarAmountShouldDelete
      )
      console.log(
        "실제로 잘린 수입, 대형트럭, 소형트럭, 일반차량 대수: ",
        splicedRegionImportedSources.length,
        splicedRegionLargeTruckSources.length,
        splicedRegionBongoPorterSources.length,
        splicedRegionDomesticSources.length
      )
      console.log("최종적으로 삭제 되어야 할 소스의 크기: ", deleteTargetCarNumbers.length)


      console.log("=============================================================")
      // 삭제 로직
      if (!deleteTargetCarNumbers.length) continue
      console.log("=============================================================")
      console.log("업로드 차량 삭제 진행")
      const responses = await this.dynamoUploadedCarClient.batchDeleteCarsByCarNumbers(deleteTargetCarNumbers)
      responses.forEach(r => {
        if (r.$metadata.httpStatusCode !== 200) {
          console.error(r)
          throw new Error("업로드 차량 삭제 실패")
        }
      })
      console.log("업로드 차량 삭제 완료")
      console.log("=============================================================")
    }
  }

  calculateAssignAmount(
    assignableAmount: number,
    domesticSourcesLength: number,
    regionImportedSourcesLength: number,
    regionLargeTruckSourcesLength: number,
    regionBongoPorterSourcesLength: number,
  ) {
    const { IMPORT_MAX_COUNT, BONGO_PORTER_MAX_COUNT, LARGE_TRUCK_MAX_COUNT} = CarAssignService
    // 해당 카테고리에서 가능한 수량 계산
    let importedSourceAmountActuallyAssign = regionImportedSourcesLength >= IMPORT_MAX_COUNT ? 0 : IMPORT_MAX_COUNT - regionImportedSourcesLength
    let largeTruckSourceAmountActuallyAssign = regionLargeTruckSourcesLength >= LARGE_TRUCK_MAX_COUNT ? 0 : LARGE_TRUCK_MAX_COUNT - regionLargeTruckSourcesLength
    let bongoPorterSourceAmountActuallyAssign = regionBongoPorterSourcesLength >= BONGO_PORTER_MAX_COUNT ? 0 : BONGO_PORTER_MAX_COUNT - regionBongoPorterSourcesLength

    // 전체 대수에서 가능한 수량 계산
    if (importedSourceAmountActuallyAssign > assignableAmount) {
      importedSourceAmountActuallyAssign = assignableAmount
      assignableAmount = 0
    } else {
      assignableAmount -= importedSourceAmountActuallyAssign
    }
    if (largeTruckSourceAmountActuallyAssign > assignableAmount) {
      largeTruckSourceAmountActuallyAssign = assignableAmount
      assignableAmount = 0
    } else {
      assignableAmount -= largeTruckSourceAmountActuallyAssign
    }
    if (bongoPorterSourceAmountActuallyAssign > assignableAmount) {
      bongoPorterSourceAmountActuallyAssign = assignableAmount
      assignableAmount = 0
    } else {
      assignableAmount -= bongoPorterSourceAmountActuallyAssign
    }

    // 전체 가능 대수에 남아있는지만 확인하면 된다.
    const domesticSourceAmountActuallyAssign = assignableAmount > domesticSourcesLength ? domesticSourcesLength : assignableAmount
    // 여기서는 더이상 assignable을 수정하지 않아도 된다.
    return {
      domesticSourceAmountActuallyAssign,
      importedSourceAmountActuallyAssign,
      largeTruckSourceAmountActuallyAssign,
      bongoPorterSourceAmountActuallyAssign,
    }
  }

  async assignCars(segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const accountRegionMap = await this.sheetClient.getAccountRegionMap()
    // 전체 목록
    const unregisteredCars = await this.getUnregisteredCars()
    const unregisteredSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    const {
      importedSources,
      largeTruckSources,
      bongoPorterSources,
      domesticSources,
    } = this.filterSources(unregisteredSources)

    console.log("=============================================================")

    for (const [region, accounts] of accountRegionMap) {
      const {
        regionSources,
        accountAssignAmountMap,
      } = await this.queryRegionSources(segmentMap, companyMap, accounts)

      const totalAmountShouldAssign = accounts.reduce((total, account)=> total + account.uploadAmount, 0)
      let assignableAmount = totalAmountShouldAssign - regionSources.length

      console.log(`${region} 지역에 할당되어야 할 차량의 총량: ${totalAmountShouldAssign}`)
      console.log(`${region} 지역에 현재 할당 된 차량의 총량: ${regionSources.length}`)
      if (assignableAmount <= 0) {
        console.log("This region's accounts are fully assigned")
        console.log("=============================================================")
        continue
      }

      // 현재 실제 할당된 카테고리별 숫자를 나타냄
      const {
        importedSources: regionImportedSources,
        largeTruckSources: regionLargeTruckSources,
        bongoPorterSources: regionBongoPorterSources,
        domesticSources: regionDomesticSources,
      } = this.filterSources(regionSources)

      const {
        domesticSourceAmountActuallyAssign,
        importedSourceAmountActuallyAssign,
        largeTruckSourceAmountActuallyAssign,
        bongoPorterSourceAmountActuallyAssign,
      } = this.calculateAssignAmount(
        assignableAmount,
        domesticSources.length,
        regionImportedSources.length,
        regionLargeTruckSources.length,
        regionBongoPorterSources.length,
      )

      console.log(
        "현재 할당 되어있는 지역별 수입, 대형트럭, 소형트럭, 일반차량 대수:",
        regionImportedSources.length,
        regionLargeTruckSources.length,
        regionBongoPorterSources.length,
        regionDomesticSources.length,
      )
      console.log(
        "현재 할당 가능한 지역별 수입, 대형트럭, 소형트럭, 일반차량 대수:",
        importedSources.length,
        largeTruckSources.length,
        bongoPorterSources.length,
        domesticSources.length,
      )
      console.log(
        "실제 할당될 지역별 수입, 대형트럭, 소형트럭, 일반차량 대수:",
        importedSourceAmountActuallyAssign,
        largeTruckSourceAmountActuallyAssign,
        bongoPorterSourceAmountActuallyAssign,
        domesticSourceAmountActuallyAssign
      )

      const carsToAssignForRegion = importedSources.splice(importedSources.length-importedSourceAmountActuallyAssign)
        .concat(largeTruckSources.splice(largeTruckSources.length-largeTruckSourceAmountActuallyAssign))
        .concat(bongoPorterSources.splice(bongoPorterSources.length-bongoPorterSourceAmountActuallyAssign))
        .concat(domesticSources.splice(domesticSources.length-domesticSourceAmountActuallyAssign))
      console.log("실제 잘린 할당될 차량 길이 : ", carsToAssignForRegion.length)

      for (const {id} of accounts) {
        const spliceAmount = accountAssignAmountMap.get(id)!
        console.log(id, spliceAmount)

        if (!spliceAmount) continue

        const uploadSourcesToAssign = carsToAssignForRegion.splice(carsToAssignForRegion.length-spliceAmount)
        const carNumbers = uploadSourcesToAssign.map(source=>source.car.carNumber)
        await this.assign(id, carNumbers)
      }
      // 3. 끝
      console.log("=============================================================")
    }
  }

  async assignAll() {
    const { segmentMap, companyMap } = await this.categoryInitializer.initializeMaps()
    await this.releaseAssignedCars(segmentMap, companyMap)
    await this.assignCars(segmentMap, companyMap)
  }

}

  // async assignAll() {
  //   const [unregisteredCars, { segmentMap, companyMap }, accountMap] = await Promise.all([
  //     this.getUnregisteredCars(),
  //     this.categoryInitializer.initializeMaps(),
  //     this.sheetClient.getAccountIdMap(),
  //   ])
  //   const classifiedSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
  //   let classifiedCarNums = classifiedSources.map(source=>source.car.carNumber.toString())

  //   const userIds = Array.from(accountMap.keys())

  //   for (const id of userIds) {
  //     console.log(id);
  //     const amountCanAssign = classifiedCarNums.length
  //     if (!classifiedCarNums.length) {
  //       console.log("No more cars to assign.");
  //       break
  //     }
  //     classifiedCarNums = await this.assign(id, amountCanAssign, classifiedCarNums)
  //   }
  // }
