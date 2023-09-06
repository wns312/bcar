import { categoryConvertor, companyConvertor, modelDetailConverter } from "./converters"
import { Company, Segment, Origin, UploadSource } from "../types"
import { Car } from "../entities"

export class CarClassifier {
  constructor(
    private cars: Car[],
    private segmentMap: Map<string, Segment>,
    private companyMap: Map<string, Company>,
  ) {}

  private classify(car: Car) {
    const convertedCategory = categoryConvertor.get(car.category)
    const convertedCompany = companyConvertor.get(car.company)


    if (!convertedCategory || !convertedCompany) return

    const { name: companyName, origin: companyOrigin } = convertedCompany
    const carSegment = this.segmentMap.get(convertedCategory)
    const carCompany = this.companyMap.get(companyName)

    if (!carSegment || !carCompany) return

    const uploadSource: UploadSource = {
      car,
      origin: convertedCompany!.origin,
      segment: {
        name: carSegment!.name,
        dataValue: carSegment!.value,
        index: carSegment!.index,
      },
      company: {
        name: carCompany.name,
        dataValue: carCompany.dataValue,
        index: carCompany.index,
      },
    }


    if (companyOrigin === Origin.Imported) {
      return uploadSource
    }
    const modelKeys = Array.from(carCompany.carModelMap.keys())
    const matchedModelKeys = modelKeys.filter(key=>car.title.indexOf(key) !== -1)
    if (!matchedModelKeys.length) {
      return uploadSource
    }
    const carModelName = matchedModelKeys[0]
    const carModel = carCompany.carModelMap.get(carModelName)
    if (!carModel) {
      console.log(carModel);
      throw new Error("carModel does not exist")
    }

    if (carModel.carSegment !== uploadSource.segment.name) return

    uploadSource.model = {
      name: carModel.name,
      dataValue: carModel.dataValue,
      index: carModel.index,
    }

    if (!carModel.detailModels || !carModel.detailModels.length) {
      return uploadSource
    }

    const filteredDetails = carModel.detailModels.filter(detail=> {
      const convertedDetailName = modelDetailConverter.get(detail.name)
      const detailName = convertedDetailName ? convertedDetailName : detail.name
      return car.title.replaceAll(" ", "").indexOf(detailName) !== -1
    })
    if (!filteredDetails.length) {
      console.log([filteredDetails, car.title]);
      return uploadSource
    }
    uploadSource.detailModel = {
      name: filteredDetails[0].name,
      dataValue: filteredDetails[0].dataValue,
      index: filteredDetails[0].index,
    }

    return uploadSource
  }

  classifyAll() {
    return this.cars.map(car => this.classify(car)).filter((car): car is UploadSource => Boolean(car))
  }
}
