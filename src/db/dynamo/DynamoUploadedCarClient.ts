import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { DynamoBaseClient } from "./DynamoBaseClient"
import { UploadedCar } from "../../entities"

export class DynamoUploadedCarClient {
  baseClient: DynamoBaseClient;
  tableName: string;
  indexName: string;

  static userPk = "#USER"
  static carPrefix = "#CAR-"

  constructor(region: string, tableName: string, indexName: string) {
    this.baseClient = new DynamoBaseClient(region);
    this.tableName = tableName;
    this.indexName = indexName;
  }

  convertUploadedCars(records: Record<string, AttributeValue>[]) {
    return records.map(record=>new UploadedCar({
      accountId: record.accountId.S!,
      carNumber: record.carNumber.S!,
      isUploaded: record.isUploaded.BOOL!,
    }))
  }

  async queryAll() {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPk },
      },
    })
    return this.convertUploadedCars(records)
  }

  async queryById(id: string) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "accountId = :i",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPk },
        ":i": { S: id },
      },
    })
    return this.convertUploadedCars(records)
  }

  async queryByIdAndIsUploaded(accountId: string, isUploaded: boolean) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "accountId = :i AND isUploaded = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPk },
        ":i": { S: accountId },
        ":u": { BOOL: isUploaded }
      },
    })
    return this.convertUploadedCars(records)
  }

  async queryCarNumbersById(accountId: string) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "accountId = :i",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPk },
        ":i": { S: accountId },
      },
      ProjectionExpression: "carNumber"
    })

    return records.map(record=>record.carNumber.S!)
  }
  async queryCarNumbersByIdAndIsUploaded(accountId: string, isUploaded: boolean) {
    const records = await this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "accountId = :i AND isUploaded = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPk },
        ":i": { S: accountId },
        ":u": { BOOL: isUploaded }
      },
      ProjectionExpression: "carNumber"
    })

    return records.map(record=>record.carNumber.S!)
  }

  batchSave(cars: UploadedCar[]) {
    const putItems = cars.map( car =>({
      Item: {
        PK: { S: DynamoUploadedCarClient.userPk },
        SK: { S: DynamoUploadedCarClient.carPrefix + car.carNumber },
        accountId: { S: car.accountId },
        carNumber: { S: car.carNumber },
        isUploaded: { BOOL: car.isUploaded },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }
  batchSaveByCarNumbers(accountId: string, carNums: string[], isUploaded: boolean) {
    const putItems = carNums.map( carNumber =>({
      Item: {
        PK: { S: DynamoUploadedCarClient.userPk },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
        accountId: { S: accountId },
        carNumber: { S: carNumber },
        isUploaded: { BOOL: isUploaded },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  batchDelete(cars: UploadedCar[]) {
    const deleteRequestInput = cars.map(car => ({
      Key: {
        PK: { S: DynamoUploadedCarClient.userPk },
        SK: { S: DynamoUploadedCarClient.carPrefix + car.carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  batchDeleteCarsByCarNumbers(carNums: string[]) {
    const deleteRequestInput = carNums.map(carNumber => ({
      Key: {
        PK: { S: DynamoUploadedCarClient.userPk },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }

  rawBatchDelete(items: Record<string, AttributeValue>[]) {
    const deleteRequestInput = items.map(item => ({
      Key: { PK: item.PK, SK: item.SK }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }
}

