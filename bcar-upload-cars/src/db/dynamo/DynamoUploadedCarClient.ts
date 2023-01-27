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
  convertUplaodedCar(records: Record<string, AttributeValue>[]) {
    return records.map(record=>new UploadedCar({
      accountId: record.accountId.S!,
      carNumber: record.carNumber.S!,
      isUploaded: record.isUploaded.BOOL!,
      registeredAt: parseInt(record.registeredAt.N!),
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
    return this.convertUplaodedCar(records)
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
    return this.convertUplaodedCar(records)
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
    return this.convertUplaodedCar(records)
  }

  batchSave(accountId: string, carNums: string[], isUploaded: boolean) {
    const now = Date.now()
    const putItems = carNums.map( carNumber =>({
      Item: {
        PK: { S: DynamoUploadedCarClient.userPk },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
        accountId: { S: accountId },
        carNumber: { S: carNumber },
        isUploaded: { BOOL: isUploaded },
        registeredAt: { N: now.toString() },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  batchDelete(carNums: string[]) {
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

