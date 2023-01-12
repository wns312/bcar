import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { DynamoCategoryClient } from "../db"
import { CarDataObject, CarDetailModel, CarModel, CarSegment, CarManufacturer, ManufacturerOrigin } from "../types"


export class CategoryInitializer {
  constructor(private dynamoCategoryClient: DynamoCategoryClient) {}

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

  async initializeMaps() {
    const [segmentResult, companyResult, carModelResult, carDetailResult] = await Promise.all([
      this.dynamoCategoryClient.scanSegment(),
      this.dynamoCategoryClient.scanCompany(),
      this.dynamoCategoryClient.scanModel(),
      this.dynamoCategoryClient.scanDetailModel(2),
    ])
    console.log("segmentResult: ", segmentResult.length)
    console.log("companyResult: ", companyResult.length)
    console.log("carModelResult: ", carModelResult.length)
    console.log("carDetailResult: ", carDetailResult.length)

    const segmentMap = this.createSegmentMap(segmentResult)
    const companyMap = this.createCompanyMap(companyResult)

    this.fillCarModelMap(companyMap, carModelResult)
    this.fillCarDetails(companyMap, carDetailResult)
    return {
      segmentMap,
      companyMap
    }
  }
}

