export interface Session {
    /** セッションIDを保持 */
    sessionid: string;
    /** 再生中の曲 */
    musicuuid?: string;
    /** 再生に使用しているプレイリスト */
    playlistuuid?: string;
    /** 再生中のアルバム */
    albumuuid?: string;
    /** 再生中のアーティスト */
    artistuuid?: string;
    /** 再生開始地点 */
    playtime: number;
    /** セッションPingを送信した時間 */
    lastconnecttime: number;
}
