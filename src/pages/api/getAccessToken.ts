import { SHA512 } from "crypto-js";
import { NextApiRequest, NextApiResponse } from "next";
import { getAccessToken } from ".";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { password } = req.body;
    if (password && SHA512(password).toString() == process.env["token"]) {
        try
        {
            res.status(200).send(await getAccessToken());
        }
        catch(err)
        {
            console.error(err);
            res.status(500).send(err);
        }
    }
    else
    {
        res.status(404).send(`Not Found`);
    }
}