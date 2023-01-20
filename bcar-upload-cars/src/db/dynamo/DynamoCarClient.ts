import { AttributeValue, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoBaseClient } from "./DynamoBaseClient"
import { Car, DraftCar } from "../../entities"

export class DynamoCarClient {
  baseClient: DynamoBaseClient;
  tableName: string;
  indexName: string;

  static carPK = "#CAR"
  static draftPK = "#DRAFT"
  static carPrefix = "#CAR-"

  constructor(region: string, tableName: string, indexName: string) {
    this.baseClient = new DynamoBaseClient(region);
    this.tableName = tableName;
    this.indexName = indexName;
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

  rawBatchDelete(items: Record<string, AttributeValue>[]) {
    const deleteRequestInput = items.map(item => ({
      Key: { PK: item.PK, SK: item.SK }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  async QueryCarsByCarNumbers(carNumbers: string[]) {
    const responses = await this.baseClient.batchGetItems(
      this.tableName,
      ...carNumbers.map(carNumber=>[DynamoCarClient.carPK, carNumber])
    )
    const records = responses.map(response=>{
      if (response.$metadata.httpStatusCode !== 200) {
        console.error(response);
        throw new Error("Response Error")
      }
      return response.Responses![this.tableName]
    }).flat()
    return records
  }

  queryCars(projectionExpressions?: string[]) {
    const input = this.createQueryInput(DynamoCarClient.carPK, projectionExpressions)
    return this.baseClient.queryItems(input)
  }

  batchDeleteCars(carNums: string[]) {
    const deleteRequestInput = carNums.map(carNumber => ({
      Key: {
        PK: { S: DynamoCarClient.carPK },
        SK: { S: DynamoCarClient.carPrefix + carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  batchSaveCar(cars: Car[]) {
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
        images: { SS: car.images }
      }
    }))

    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  // Draft
  queryDrafts(projectionExpressions?: string[]) {
    const input = this.createQueryInput(DynamoCarClient.draftPK, projectionExpressions)
    return this.baseClient.queryItems(input)
  }

  queryDraftWithRange(start: number, end: number) {
    return this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: `PK = :p`,
      FilterExpression: "#I BETWEEN :s AND :e",
      ExpressionAttributeNames: {
        "#I": "index"
      },
      ExpressionAttributeValues: {
        ":p": { S: DynamoCarClient.draftPK },
        ":s": { N: start.toString() },
        ":e": { N: end.toString() },
      },
    })
  }

  batchSaveDraft(cars: DraftCar[]) {
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

  batchDeleteDrafts(carNums: string[]) {
    const deleteRequestInput = carNums.map(carNumber => ({
      Key: {
        PK: { S: DynamoCarClient.draftPK },
        SK: { S: DynamoCarClient.carPrefix + carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }


}
