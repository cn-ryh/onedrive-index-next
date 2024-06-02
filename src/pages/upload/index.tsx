import Head from 'next/head'
import { useRouter } from 'next/router'
import siteConfig from '../../../config/site.config'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import Breadcrumb from '../../components/Breadcrumb'
import SwitchLayout from '../../components/SwitchLayout'
import React, { useRef, useState } from 'react';
import { UploadFile, Upload, Space, MessagePlugin, RequestMethodResponse, Input, NotificationPlugin } from 'tdesign-react/lib';
import 'tdesign-react/dist/tdesign.css'; // 全局引入所有组件样式代码
import axios from 'axios';
import { driveApi } from '../../../config/api.config';
import { baseDirectory } from '../../../config/site.config';
import { queryToPath } from '../../components/FileListing'
import { UploadOuterForwardRef } from 'tdesign-react/lib/upload/upload'
import { UploadRef } from 'tdesign-react/lib/upload/interface'
const ABRIDGE_NAME = [4, 6];
function sleep(time: number) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), time));
}
export default function TUploadImageFlow() {
    const [password, setPassword] = useState('');
    const [images, setImages]: [UploadFile[], React.Dispatch<React.SetStateAction<UploadFile[]>>] = useState([] as UploadFile[]);
    const [files, setFiles]: [UploadFile[], React.Dispatch<React.SetStateAction<UploadFile[]>>] = useState([] as UploadFile[]);
    const uploadRef: React.ForwardedRef<UploadRef> = useRef(null)
    // every block 6Mib
    const blockSize = 6553600;
    /**
     * 
     * @param file 要上传的文件对象
     * @param uploadRef 上传组件 Ref（用于更新上传进度）
     * @param accessToken OneDrive token
     * @param parentId 上传到的文件夹 id
     */
    const uploadFileToCloud = (file: UploadFile, accessToken: string, parentId: string) => {

        const fileValue = file.raw!;
        const uploadName = fileValue.name!.substring(0, fileValue.name!.lastIndexOf("."))
            + `-` + (new Date().getTime()).toString()
            + fileValue.name!.substring(fileValue.name!.lastIndexOf("."));
        const fileSize = fileValue.size;
        return new Promise<void>((resolve, reject) => {
            axios.post(encodeURI(`${driveApi}/items/${parentId}:/${uploadName}:/createUploadSession`),{},{
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }).then(async (getPutPathRes) => {
                const putPath: string = getPutPathRes.data.uploadUrl;
                
                // the retry time of THIS BLOCK 
                let retryTime = 0;
                for (let beginByte = 0; beginByte < fileSize; beginByte += blockSize) {
                    try {
                        const endByte = Math.min(beginByte + blockSize - 1, fileSize - 1);
                        const uploadLog = await axios.put(putPath, fileValue.slice(beginByte, endByte + 1), {
                            headers:
                            {
                                Authorization: `Bearer ${accessToken}`,
                                // NOT blockSize, the last block may smaller
                                "Content-Range": `bytes ${beginByte}-${endByte}/${fileSize}`
                            }
                        })
                        // this block successly put, clear retryTime
                        retryTime = 0;
                        uploadRef.current?.uploadFilePercent({
                            file,
                            percent: Math.floor(100 * endByte / fileSize)
                        })
                    }
                    catch (err) {
                        console.error(err);
                        if (retryTime >= 5) {
                            NotificationPlugin.error({
                                title: `出现问题，请查看日志`,
                                content: `达到最大重试次数`
                            })
                            await axios.delete(putPath, {
                                headers: {
                                    Authorization: `Bearer ${accessToken}`
                                }
                            });
                            reject(`Max retry Time`);
                            return;
                        }
                        else {
                            // retry after 2s
                            await sleep(2000);
                            ++retryTime;
                            beginByte -= blockSize;
                        }
                    }
                }
                resolve();
            }).catch((err) => {
                console.error(err);
                reject(err);
            })
        })
    }
    const filesRequestMethod = (fileList: UploadFile | UploadFile[]) => {
        return new Promise<RequestMethodResponse>((resolve) => {
            if (!password || password == ``) {
                NotificationPlugin.error({
                    title: `请输入上传密码`
                })
                resolve({
                    status: 'fail',
                    response: {
                        error: `未输入上传密码`
                    }
                });
                return;
            }
            const uploadPath = queryToPath(query);

            axios.post(`/api/getAccessToken`, {
                password: password
            }).then((token) => {
                axios.get(`/api/?path=${encodeURI(uploadPath)}`).then((getParentRes) => {
                    const parentId = getParentRes.data.id;
                    const List: Promise<UploadFile>[] = [];
                    for (let file of fileList as UploadFile[]) {
                        // const fileValue = file.raw!;
                        // const fileBlob = new Blob([fileValue], { type: fileValue.type })
                        // const baseName = fileValue.name!.substring(0, fileValue.name!.lastIndexOf("."));
                        // const extName = fileValue.name!.substring(fileValue.name!.lastIndexOf("."));
                        List.push(new Promise<UploadFile>((uploadFileResolve) => {
                            uploadFileToCloud(file, token.data, parentId).then(()=>
                            {
                                uploadFileResolve({
                                    name: file.name,
                                    status: `success`
                                })
                            }).catch((err)=>
                            {
                                uploadFileResolve({
                                    name: file.name,
                                    status: `fail`
                                })
                            })
                            // axios.put(driveApi + `/root:${baseDirectory}/${baseName + `-` + (new Date().getTime()).toString() + extName}` + `:/content`, fileValue, {
                            //     headers: {
                            //         "Authorization": token.data,
                            //         "Content-Type": `text/plain`
                            //     }
                            // }).then((uploadRes) => {
                            //     console.log(uploadRes);
                            //     uploadFileResolve({
                            //         name: file.name!,
                            //         url: uploadRes.data["@microsoft.graph.downloadUrl"],
                            //         status: `success`
                            //     })
                            // }).catch((err) => {
                            //     console.error(err);
                            //     uploadFileResolve({
                            //         name: file.name!,
                            //         url: ``,
                            //         status: `fail`
                            //     })
                            // })
                        }))
                    }
                    Promise.all(List).then((data) => {

                        resolve({
                            status: data.find((value)=>
                            {
                                return value.status === `fail`
                            })? 'fail':`success`,
                            response: {
                                files: data
                            }
                        })
                    }).catch((err) => {
                        console.error(err);
                    })
                }).catch((err) => {
                    console.error(err);
                    if (err && err.error && err.error.error && err.error.error.code === `itemNotFound`) {
                        NotificationPlugin.error({
                            title: `要上传的路径不存在`
                        })
                        resolve({
                            status: 'fail',
                            response: {
                                error: `要上传的路径不存在`
                            }
                        })
                    }
                    else {
                        NotificationPlugin.error({
                            title: `获取文件夹id失败`
                        })
                        resolve({
                            status: 'fail',
                            response: {
                                error: err.message ?? `获取文件夹id失败`
                            }
                        })
                    }

                })

            }).catch((err) => {
                resolve({
                    status: 'fail',
                    response: {
                        error: err
                    }
                });
            })
        })
    };
    let i = 0;

    // 有文件数量超出时会触发，文件大小超出限制、文件同名时会触发等场景。注意如果设置允许上传同名文件，则此事件不会触发
    const onValidate = (params) => {
        const { files, type } = params;
        if (type === 'FILE_OVER_SIZE_LIMIT') {
            files.map((t) => t.name).join('、');
            MessagePlugin.warning(`${files.map((t) => t.name).join('、')} 等文件大小超出限制，已自动过滤`, 5000);
        } else if (type === 'FILES_OVER_LENGTH_LIMIT') {
            MessagePlugin.warning('文件数量超出限制，仅上传未超出数量的文件');
        } else if (type === 'FILTER_FILE_SAME_NAME') {
            MessagePlugin.warning('不允许上传同名文件');
        }
    };
    const { query } = useRouter()
    return (
        <div>
            <Head>
                <title>{siteConfig.title}</title>
            </Head>
            <center>
                <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
                    <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
                        <Navbar />
                        <div className="mx-auto w-full max-w-5xl py-4 sm:p-4">
                            <nav className="mb-4 flex items-center justify-between space-x-3 px-4 sm:px-0 sm:pl-1">
                                <Breadcrumb query={query} />
                                <SwitchLayout />
                            </nav>

                            <Space direction="vertical">
                                <Input
                                    placeholder="请输入上传密码"
                                    value={password}
                                    onChange={setPassword}
                                    type='password'
                                />
                                <br />
                                <Upload
                                    ref={uploadRef}
                                    files={files}
                                    onChange={setFiles}
                                    placeholder="文件上传"
                                    theme="file-flow"
                                    multiple
                                    max={0}
                                    abridge-name={ABRIDGE_NAME}
                                    requestMethod={filesRequestMethod}
                                    autoUpload={false}
                                    showThumbnail={true}
                                    uploadAllFilesInOneRequest={true}
                                    isBatchUpload={false}
                                    allowUploadDuplicateFile={false}
                                    onValidate={onValidate}
                                />
                            </Space>

                        </div>
                    </main>

                    <Footer />
                </div>
            </center>
        </div>
    );
}
