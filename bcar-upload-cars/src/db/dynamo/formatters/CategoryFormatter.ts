import { PutRequest } from "@aws-sdk/client-dynamodb";
import { CarManufacturer, CarSegment } from "../../../types"

export class CategoryFormatter {
  private constructor(){}

  static createSegmentForm(segmentMap: Map<string, CarSegment>): PutRequest[] {
    return Array.from(segmentMap.keys()).map(k =>{
      const segObj = segmentMap.get(k)
      return {
        Item: {
          PK: { S: `#SEGMENT-${segObj!.name}` },
          SK: { S: `#SEGMENT-${segObj!.name}` },
          name: { S: segObj!.name },
          value: { S: segObj!.value },
          index: { N: segObj!.index.toString() },
        }
      }
    })
  }

  static createManufacturerForm(companyMap: Map<string, CarManufacturer>): PutRequest[] {
    return Array.from(companyMap.keys()).map(k =>{
      const companyObj = companyMap.get(k)
      return {
        Item: {
          PK: { S: `#COMPANY-${companyObj!.name}` },
          SK: { S: `#COMPANY-${companyObj!.name}` },
          name: { S: companyObj!.name },
          value: { S: companyObj!.dataValue },
          index: { N: companyObj!.index.toString() },
          origin: { S : companyObj!.origin }
        }
      }
    })
  }

  static createCarModelForm(companyMap: Map<string, CarManufacturer>): PutRequest[] {
    const companyKeys = Array.from(companyMap.keys())
    const carModelList: PutRequest[] = []

    companyKeys.reduce((map, key)=> {
      const companyObj = companyMap.get(key)
      const carModelMap = companyObj?.carModelMap
      const carModelKeys = Array.from(carModelMap!.keys())
      carModelKeys.forEach(k => {
        if (!companyObj || !carModelMap) {
          console.error(companyObj);
          console.error(carModelMap);
          throw new Error("there is no proper companyObj or carModelMap");
        }
        map.push({
          Item: {
            PK: { S: `#MODEL-${carModelMap!.get(k)!.name}` },
            SK: { S: `#COMPANY-${companyObj!.name}` },
            segment: { S: carModelMap!.get(k)!.carSegment },
            company: { S: companyObj!.name },
            modelAmount: { N: carModelMap!.get(k)!.detailModels!.length.toString() },
            name: { S: k },
            value: { S: carModelMap!.get(k)!.dataValue },
            index: { N: carModelMap!.get(k)!.index.toString() },
          }
        })
      })
      return map
    }, carModelList)

    return carModelList
  }

  static createCarDetailModelForm(companyMap: Map<string, CarManufacturer>): PutRequest[] {
    const companyKeys = Array.from(companyMap.keys())
    const carDetailModelList: PutRequest[] = []

    companyKeys.reduce((map, key)=> {
      const company = companyMap.get(key)
      if (!company) {
        console.error(key);
        throw new Error("there is no proper company");
      }
      const carModelMap = company.carModelMap
      const carModelKeys = Array.from(carModelMap!.keys())
      carModelKeys.forEach(k => {
        const carModel = carModelMap.get(k)

        if (!carModel) {
          console.error(carModel);
          throw new Error("there is no carModel");

        }
        const carDetailModels = carModel.detailModels
        if (!carDetailModels) {
          console.error({
              carDetailModels,
              key: k
            });
          return
        }

        carDetailModels!.forEach(carDetail => {
          map.push({
            Item: {
              PK: { S: `#DETAIL-${carDetail.name}`},
              SK: { S: `#MODEL-${carModel.name}`},
              segment: { S: carModel.carSegment },
              company: { S: company!.name },
              name: { S: carDetail.name },
              value: { S: carDetail.dataValue },
              index: { N: carDetail.index.toString() },
            }
          })
        })

      })

      return map
    }, carDetailModelList)

    return carDetailModelList
  }

}
