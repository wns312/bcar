import { DynamoCarClient } from "../db";
import { SourceCollector } from "../automations"

export class CarCollectService {

  constructor(
    private sourceCollector: SourceCollector,
    private dynamoCarClient: DynamoCarClient,
  ) {}

  async collect() {
    const carListObjs = await this.sourceCollector.crawlCar()
    // const carNumberList = await this.dynamoCarClient.segmentScanCar(10, ["CarNumber"])
    // console.log(carNumberList.length);

  }
}
