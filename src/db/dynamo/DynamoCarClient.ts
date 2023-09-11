import { AttributeValue, BatchWriteItemCommandOutput, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoBaseClient } from "./DynamoBaseClient"
import { Car, DraftCar } from "../../entities"

export class DynamoCarClient {
  baseClient: DynamoBaseClient;
  tableName: string;
  indexName: string;

  static carPK = "#CAR"
  static draftPK = "#DRAFT"
  static carPrefix = "#CAR-"

  static PK_SK_INDEX = "PK-SK-index"
  static PK_UPLOADER_INDEX = "PK-uploader-index"

  constructor(region: string, tableName: string, indexName: string) {
    this.baseClient = new DynamoBaseClient(region);
    this.tableName = tableName;
    this.indexName = indexName;
  }

  convertCars(records: Record<string, AttributeValue>[]) {
    return records.map(record=>new Car({
      category: record.category.S!,
      displacement: parseInt(record.displacement.N!),
      carNumber: record.carNumber.S!,
      modelYear: record.modelYear.S!,
      mileage: parseInt(record.mileage.N!),
      color: record.color.S!,
      gearBox: record.gearBox.S!,
      fuelType: record.fuelType.S!,
      presentationNumber: record.presentationNumber.S!,
      hasAccident: record.hasAccident.S!,
      registerNumber: record.registerNumber.S!,
      presentationsDate: record.presentationsDate.S!,
      hasSeizure: record.hasSeizure.BOOL!,
      hasMortgage: record.hasMortgage.BOOL!,
      carCheckSrc: record.carCheckSrc.S!,
      images: record.images.L!.map(attr=>attr.S!),
      title: record.title.S!,
      price: parseInt(record.price.N!),
      company: record.company.S!,
      isUploaded: record.isUploaded.BOOL!,
      uploader: record.uploader.S!,
    }))
  }

  private createQueryInput(pk: string, projectionExpressions?: string[]): QueryCommandInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression: `PK = :p`,
      ExpressionAttributeValues: {
        ":p": { S: pk },
      },
      ProjectionExpression: projectionExpressions && projectionExpressions.join(", "),
    }
  }

  async queryAssignedCars() {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "uploader <> :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":u": { S: "null" },
      },
    })
    return this.convertCars(records)
  }

  async queryAssignedCarsByUploader(uploader: string) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      IndexName: DynamoCarClient.PK_UPLOADER_INDEX,
      KeyConditionExpression: "PK = :p and uploader = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":u": { S: uploader },
      },
    })
    return this.convertCars(records)
  }

  async queryNotAssignedCars() {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "uploader = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":u": { S: "null" },
      },
    })
    return this.convertCars(records)
  }

  async queryAssignedAndUploadedCars() {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "isUploaded = :i",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":i": { BOOL: true },
      },
    })
    return this.convertCars(records)
  }

  async queryAssignedAndNotUploadedCars() {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "isUploaded = :i",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":i": { BOOL: false },
      },
    })
    return this.convertCars(records)
  }

  async queryAssignedAndUploadedCarsByUploader(uploader: string) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      IndexName: DynamoCarClient.PK_UPLOADER_INDEX,
      KeyConditionExpression: "PK = :p AND uploader = :u",
      FilterExpression: "isUploaded = :i",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":u": { S: uploader },
        ":i": { BOOL: true },
      },
    })
    return this.convertCars(records)
  }

  async queryAssignedAndNotUploadedCarsByUploader(uploader: string) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "isUploaded = :i AND uploader = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.carPK },
        ":i": { BOOL: false },
        ":u": { S: uploader },
      },
    })
    return this.convertCars(records)
  }

  async queryCars() {
    const input = this.createQueryInput(DynamoCarClient.carPK)
    const records = await this.baseClient.queryItems(input)
    return this.convertCars(records)
  }

  queryCarsWithProjection(projectionExpressions: string[]) {
    const input = this.createQueryInput(DynamoCarClient.carPK, projectionExpressions)
    return this.baseClient.queryItems(input)
  }

  batchDeleteCars(cars: Car[]): Promise<BatchWriteItemCommandOutput[]>  {
    if (!cars.length) return new Promise((resolve)=>resolve([]))
    const deleteRequestInput = cars.map(car => ({
      Key: {
        PK: { S: DynamoCarClient.carPK },
        SK: { S: DynamoCarClient.carPrefix + car.carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  batchDeleteCarsByCarNumbers(carNumbers: string[]) {
    const deleteRequestInput = carNumbers.map(carNumber => ({
      Key: {
        PK: { S: DynamoCarClient.carPK },
        SK: { S: DynamoCarClient.carPrefix + carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  async deleteAllCars() {
    const carNumberAttrs = await this.queryCarsWithProjection(["carNumber"])
    const carNumbers = carNumberAttrs.map(attr=>attr.carNumber.S!)
    console.log("Existing cars: ", carNumbers.length)
    if (!carNumbers.length) return

    const responses = await this.batchDeleteCarsByCarNumbers(carNumbers)
    responses.forEach(response=>{
      if (response.$metadata.httpStatusCode !== 200) {
        console.error(response)
        throw new Error("Response Error")
      }
    })
  }

  batchSaveCar(cars: Car[]): Promise<BatchWriteItemCommandOutput[]>  {
    if (!cars.length) return new Promise((resolve)=>resolve([]))
    const putItems = cars.map(car=>({
      Item: {
        PK: { S: DynamoCarClient.carPK },
        SK: { S: DynamoCarClient.carPrefix + car.carNumber },
        category: { S: car.category },
        displacement: { N: car.displacement.toString() },
        title: { S: car.title },
        company: { S: car.company },
        carNumber: { S: car.carNumber },
        modelYear: { S: car.modelYear },
        mileage: { N: car.mileage.toString() },
        color: { S: car.color },
        price: { N: car.price.toString() },
        gearBox: { S: car.gearBox },
        fuelType: { S: car.fuelType },
        presentationNumber: { S: car.presentationNumber },
        hasAccident: { S: car.hasAccident },
        registerNumber: { S: car.registerNumber },
        presentationsDate: { S: car.presentationsDate },
        hasSeizure: { BOOL: car.hasSeizure },
        hasMortgage: { BOOL: car.hasMortgage },
        carCheckSrc: { S: car.carCheckSrc },
        images: { L: car.images.map(image=>({S: image})) },
        uploader: { S: car.uploader },
        isUploaded: { BOOL: car.isUploaded },
      }
    }))

    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  // Draft
  async queryDrafts() {
    const input = this.createQueryInput(DynamoCarClient.draftPK)
    const records = await this.baseClient.queryItems(input)
    return records.map(record=>new DraftCar({
      title: record.title.S!,
      company: record.company.S!,
      carNumber: record.carNumber.S!,
      detailPageNum: record.detailPageNum.S!,
      price: parseInt(record.price.N!),
    }))
  }

  batchSaveDraft(cars: DraftCar[]): Promise<BatchWriteItemCommandOutput[]> {
    if (!cars.length) return new Promise((resolve)=>resolve([]))
    const putItems = cars.map( (car, index) =>({
      Item: {
        PK: { S: DynamoCarClient.draftPK },
        SK: { S: DynamoCarClient.carPrefix + car.carNumber },
        index: { N: index.toString() },
        carNumber: { S: car.carNumber },
        company: { S: car.company },
        title: { S: car.title },
        price: { N: car.price.toString() },
        detailPageNum: { S: car.detailPageNum.toString() },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  batchDeleteDrafts(cars: DraftCar[]): Promise<BatchWriteItemCommandOutput[]> {
    if (!cars.length) return new Promise((resolve)=>resolve([]))
    const deleteRequestInput = cars.map(car => ({
      Key: {
        PK: { S: DynamoCarClient.draftPK },
        SK: { S: DynamoCarClient.carPrefix + car.carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }
}


  // rawBatchDelete(items: Record<string, AttributeValue>[]) {
  //   const deleteRequestInput = items.map(item => ({
  //     Key: { PK: item.PK, SK: item.SK }
  //   }))
  //   return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  // }

  // async queryCarsByCarNumbers(carNumbers: string[]): Promise<Car[]> {
  //   if (!carNumbers.length) return []
  //   const responses = await this.baseClient.batchGetItems(
  //     this.tableName,
  //     ...carNumbers.map(carNumber=>[DynamoCarClient.carPK, DynamoCarClient.carPrefix + carNumber])
  //   )
  //   const records = responses.map(response=>{
  //     if (response.$metadata.httpStatusCode !== 200) {
  //       console.error(response);
  //       throw new Error("Response Error")
  //     }
  //     return response.Responses![this.tableName]
  //   }).flat()
  //   return this.convertCars(records)
  // }

  // queryDraftWithProjection(projectionExpressions: string[]) {
  //   const input = this.createQueryInput(DynamoCarClient.draftPK, projectionExpressions)
  //   return this.baseClient.queryItems(input)
  // }

  // queryDraftWithRange(start: number, end: number) {
  //   return this.baseClient.queryItems({
  //     TableName: this.tableName,
  //     KeyConditionExpression: `PK = :p`,
  //     FilterExpression: "#I BETWEEN :s AND :e",
  //     ExpressionAttributeNames: {
  //       "#I": "index"
  //     },
  //     ExpressionAttributeValues: {
  //       ":p": { S: DynamoCarClient.draftPK },
  //       ":s": { N: start.toString() },
  //       ":e": { N: end.toString() },
  //     },
  //   })
  // }
