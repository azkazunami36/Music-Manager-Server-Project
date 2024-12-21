export interface ArtistInfo {
    /** アーティストを識別するUUID */
    artistuuid?: string;
    /** アーティストのキャラクターボイスを担当するアーティストUUID */
    charactervoiceuuid?: string[];
    /** アーティスト名 */
    artistname?: string;
    /** アーティスト画像 */
    artistpictures?: {
        languagetype?: string;
        filename?: string;
        main?: boolean;
    }[];
}
