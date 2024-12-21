export function getUrlQueries(string: string) {
    const split = string.split("?");
    if (split.length <= 0 || !split[1]) return {};
    const search = split[1];
    const queries: { [name: string]: string } = {};
    if (!search) return queries;
    search.split('&').forEach(function (queryStr) {
        const queryArr = queryStr.split('=');
        queries[queryArr[0]] = queryArr[1];
    });
    return queries;
}
