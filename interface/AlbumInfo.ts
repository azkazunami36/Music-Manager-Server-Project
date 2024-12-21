import { BaseInfo } from "./BaseInfo.js";
import { InfoInArtist } from "./InfoInArtist.js";

export interface AlbumInfo extends BaseInfo {
    /** アルバムを識別するUUID */
    albumuuid?: string;
    /** アルバム作成を担当した、またはアルバム内の主なアーティスト一覧 */
    artists?: InfoInArtist[];
    /** アルバムに登録されている曲一覧 */
    musicsuuid?: string[];
    /** アルバム名 */
    albumname?: string;
    /** アルバム写真 */
    albumpictures?: {
        languagetype?: string;
        filename?: string;
        main?: boolean;
    }[];
}
