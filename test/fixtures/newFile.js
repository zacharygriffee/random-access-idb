// Helper function to generate random file names
import defaultMaker from "../../index.js";
import {makeid} from "../utils/makeid.js";
import {promisify} from "../utils/promisify.js";

export function newFile(config) {
    const randomName = makeid(10) + ".txt";
    const file = defaultMaker(randomName, config);

    return {
        file,
        close: () => promisify(file, 'purge')
    };
}