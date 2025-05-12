/**
 * StaticDataProvider.ts
 * 
 * This module provides static data responses for specific user queries.
 * It will be replaced with actual API calls in the future.
 */

/**
 * Checks if the query is about flight information
 */
export function isFlightInfoQuery(query: string): boolean {
  const flightKeywords = [
    '飛行機', 'フライト', 'flight', '便', 
    '航空', 'air', 'plane', '出発', '到着',
    'departure', 'arrival', '空港', 'airport'
  ];
  
  return flightKeywords.some(keyword => query.toLowerCase().includes(keyword));
}

/**
 * Provides static flight information
 * This will be replaced with actual API calls in the future
 */
export function getStaticFlightInfo(): string {
  // Static flight information
  return `
明日の飛行機の時間は以下の通りです：

東京(羽田) → 大阪(伊丹)
- JL123: 朝8:00発 (到着 9:15)
- NH789: 朝9:30発 (到着 10:45)
- JL456: 午後13:00発 (到着 14:15)
- NH951: 午後15:30発 (到着 16:45)
- JL789: 夕方18:00発 (到着 19:15)

東京(羽田) → 福岡
- JL321: 朝7:30発 (到着 9:30)
- NH654: 午前11:00発 (到着 13:00)
- JL987: 午後14:30発 (到着 16:30)
- NH321: 夕方17:45発 (到着 19:45)

東京(成田) → ソウル(仁川)
- KE712: 朝9:00発 (到着 11:30)
- OZ104: 午後13:00発 (到着 15:30)
- JL091: 夕方16:00発 (到着 18:30)

東京(成田) → 台北(桃園)
- CI223: 朝10:15発 (到着 13:00)
- JL805: 午後14:45発 (到着 17:30)

※これらは仮の情報です。実際のフライト情報はご予約内容や各航空会社のウェブサイトでご確認ください。
`;
}

/**
 * Process query and return appropriate static data if available
 */
export function processQueryForStaticData(query: string): string | null {
  if (isFlightInfoQuery(query)) {
    return getStaticFlightInfo();
  }
  
  // Add more static data handlers here in the future
  
  return null; // No static data available for this query
}
