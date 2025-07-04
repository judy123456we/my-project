// 加载功能按钮
document.getElementById('btn').innerHTML = `
<button type="button" class="btn btn-primary w-75 d-block mx-auto mb-3" id="get-data" disabled>获取数据</button>
<button type="button" class="btn btn-primary w-75 d-block mx-auto mb-3" id="manual-query">手动查询</button>
<button type="button" class="btn btn-primary w-75 d-block mx-auto mb-3" id="convert-image">转换图片</button>
<button type="button" class="btn btn-danger w-75 d-block mx-auto mb-3" id="clean-data">清空数据</button>
`

const textarea = document.querySelector('textarea')
const getDataBtn = document.getElementById('get-data')
const manualQuery = document.getElementById('manual-query')
const convImage = document.getElementById('convert-image')
const cleanData = document.getElementById('clean-data')

/**
 * @description 追加日志信息到文本区域并自动滚动到底部
 * @param {string} text - 要追加的日志文本
 */
const log = text => {
  textarea.value += text + '\n'
  textarea.scrollTop = textarea.scrollHeight
}

/**
 * @description 将日期格式化为 YYYY-MM-DD 字符串
 * @param {string|Date} date - 输入的日期对象或日期字符串
 * @returns {string} 返回格式化后的日期字符串，如果格式无效，则返回原始输入
 */
function formatDateStr (date) {
  try {
    return new Date(+new Date(date) + 8 * 3600 * 1000).toISOString().slice(0, 10)
  } catch {
    return date
  }
}

/**
 * @description 按个数拆分数组
 * @param {Array} array - 原始数组
 * @param {number} subNum - 拆分的数量
 * @returns {Array} - 拆分后的数据
 */
function splitArray (array, subNum) {
  let index = 0
  const newArray = []
  while (index < array.length) {
    newArray.push(array.slice(index, (index += subNum)))
  }
  return newArray
}

/**
 * @description 按个数拆分二维数组
 * @param {Array} array - 原始二维数组
 * @param {number} subNum - 每组包含的子数组数量
 * @returns {Array} - 拆分后的二维数组
 */
function splitArray2D(array, subNum) {
  let index = 0
  const newArray = []
  while (index < array.length) {
    newArray.push(array.slice(index, index + subNum))
    index += subNum
  }
  return newArray
}


// 配置
const config = {}

log('正在获取配置')
google.script.run.withFailureHandler(error => {
  console.error(error.message)
  log('获取配置失败，请检查配置表格名称是否是「配置」')
}).withSuccessHandler(result => {
  log('✅获取配置成功')
  config.init = JSON.parse(result)
  getDataBtn.disabled = false
}).core('getInitStr')

// 转换图片
convImage.addEventListener('click', async () => {
  // 获取图片列的函数
  const imageFormulas = await new Promise(resolve => {
    log('💬正在获取 图片库清单')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 图片库清单 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      config.modiSheetList = result
      log('✅已获取 图片库清单')
      resolve(JSON.parse(result).result)
    }).core('getImageList')
  })

  for (let i = 0; i < imageFormulas.length; i++) {
    const formula = imageFormulas[i][0] || ''
    if (formula && /fbcdn|cdninstagram/.test(formula)) {
      const imageUrl = formula.replace(/=IMAGE\("|"\)/g, '')
      const blob = await fetch(imageUrl).then(r => r.blob())
      // 将 Blob 转换为 Base64
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = function () {
        const base64data = reader.result.split(',')[1] // 去掉前缀
        google.script.run.withFailureHandler(error => {
          console.error(error.message)
          log(`❌写入 ${i + 2} 行失败`)
          log(error.message)
        }).withSuccessHandler(result => {
          log(`✅已写入 ${i + 2} 行`)
        }).writeImageSheet({
          row: i + 2,
          imageBase64: base64data,
          type: blob.type
        })
      }
    }
  }
})

// 手动查询
manualQuery.addEventListener('click', async () => {
  log('💬正在 获取线索信息')
  const userList = await new Promise(resolve => {
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 线索信息 失败')
    }).withSuccessHandler(result => {
      if (result === '需要在查询表里使用') {
        log(result)
      } else {
        log('✅获取 线索信息 成功')
        resolve(JSON.parse(result).result)
      }
    }).core('manualMatchPostInfoStr')
  })
  // 没有 Chatbot 表线索，需要先获取
  if (!config.chatbotQueryUser) {
    // 获取chatbot表清单
    const chatbotSheetList = await new Promise(resolve => {
      log('💬正在获取 Chatbot 表')
      google.script.run.withFailureHandler(error => {
        console.error(error.message)
        log('❌获取 Chatbot 表 失败')
        log(error.message)
      }).withSuccessHandler(result => {
        log('✅已获取 Chatbot 表')
        resolve(JSON.parse(result))
      }).core('getChatbotSheetStr', config.init.myName)
    })
    
    config.chatbotSheetList = chatbotSheetList.result

    const requestList = []
    const userListFormat = userList.map(x => x[1]).filter(x => x[0])
    for (const info of config.chatbotSheetList) {
      const [pageId, pageIdentifier, chatbotSheetUrl] = info
      requestList.push(new Promise(resolve => {
        log('💬正在查询线索信息')
        google.script.run.withFailureHandler(error => {
          console.error(error.message)
          log('❌查询线索信息 失败')
          log(error.message)
        }).withSuccessHandler(result => {
          log('✅已查询 线索信息')
          console.log(JSON.parse(result))
          resolve(result)
        }).core('chatbotQueryStr', { nameList: userListFormat, pageId, identifier: pageIdentifier, sheetUrl: chatbotSheetUrl })
      }))
    }

    await Promise.all(requestList).then(res => {
      const arr = res.map(x => JSON.parse(x))
      try {
        config.chatbotQueryUser = arr.filter(x => x.type === 'Chatbot线索').map(x => x.result).flat()
      } catch (error) {
        console.error(error.message)
        log('❌ 出现错误')
        log(error.message)
      }
    })
  }
  const result = []
  for (let i = 0; i < userList.length; i++) {
    const [date, username, gender, postDate] = userList[i]
    if (!username || postDate) {
      result.push(['查询不到', '', '', '', '', ''])
      continue
    }
    const data = config.chatbotQueryUser.filter(x => x[3] === username && formatDateStr(x[6]) <= formatDateStr(date))
    const targetDate = formatDateStr(date)
    let closestEntry = ['', '', '', '', '', '', '', '查询不到', '', '']
    let minDiff = Infinity
    // 查找日期最近的
    data.forEach(entry => {
      const entryDate = new Date(entry[6])
      const diff = Math.abs(entryDate - new Date(targetDate))
      if (diff < minDiff) {
        minDiff = diff
        closestEntry = entry
      }
    })
    // console.log(closestEntry)
    const [pageId, identifier, sheetUrl, user, tag, postUrl, subscribeDate, userGender, postId] = closestEntry
    result.push([formatDateStr(subscribeDate), postId, postUrl, pageId, identifier, sheetUrl])
  }
  log('💬正在填表')
  google.script.run.withFailureHandler(error => {
    console.error(error.message)
    log('❌填表失败失败')
  }).withSuccessHandler(result => {
    if (result === '需要在查询表里使用') {
      log(result)
    } else {
      log('✅手动查询完成')
    }
  }).core('manualMatchPostInfoWrite', result)
})

// 清空数据
cleanData.addEventListener('click', () => {
  const ask = confirm('确定要清空所有数据吗？')
  if (!ask) return
  log('💬正在 清空所有数据')
  google.script.run.withFailureHandler(error => {
    console.error(error.message)
    log('❌清空所有数据 失败')
  }).withSuccessHandler(result => {
    log('✅清空所有数据 成功')
  }).core('cleanData')
})

// 获取数据
getDataBtn.addEventListener('click', async () => {
  // 获取摸底表清单
  log('💬正在获取 摸底表清单')
  await new Promise(resolve => {
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 摸底表清单 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      config.modiSheetList = result
      log('✅已获取 摸底表清单')
      resolve()
    }).core('getModiSheet')
  })

  const modiSheetListArr = splitArray(config.modiSheetList, 5)
  const modiSheetUserResult = []
  for (const arr of modiSheetListArr) {
    const requestList = []
    for (const sheetUrl of arr) {
      requestList.push(new Promise(resolve => {
        log('💬正在获取 摸底表线索')
        google.script.run.withFailureHandler(error => {
          console.log(sheetUrl)
          console.error(error.message)
          log('❌获取 摸底表线索 失败')
          log(error.message)
        }).withSuccessHandler(result => {
          log('✅已获取 摸底表线索')
          resolve(result)
        }).core('getModiSheetUserStr', {
          link: sheetUrl,
          myName: config.init.myName,
          startDate: config.init.modiStartDate,
          endDate: config.init.modiEndDate
        })
      }))
    }

    await Promise.all(requestList).then(res => {
      const arr = res.map(x => JSON.parse(x))
      modiSheetUserResult.push(arr.filter(x => x.type === '摸底线索').map(x => x.result).flat())
    })
  }
  config.modiSheetUser = modiSheetUserResult.flat()




  // 获取摸底表线索
  const requestList = []

  // 获取见证线索
  requestList.push(new Promise(resolve => {
    log('💬正在获取 见证线索')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 见证线索 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已获取 见证线索')
      resolve(result)
    }).core('getJianZhengDataStr', {
      myName: config.init.myName,
      jianZhengSheetId: config.init.jianZhengSheetId,
      startDate: config.init.jianZhengStartDate,
      endDate: config.init.jianZhengEndDate,
      churchStartDate: config.init.churchStartDate,
      churchEndDate: config.init.churchEndDate
    })
  }))
  // 获取交教会线索
  requestList.push(new Promise(resolve => {
    log('💬正在获取 交教会线索')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 交教会线索 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已获取 交教会线索')
      resolve(result)
    }).core('getChurchDataStr', {
      myName: config.init.myName,
      churchStartDate: config.init.churchStartDate,
      churchEndDate: config.init.churchEndDate
    })
  }))
  // 获取 Chatbot 表链接
  requestList.push(new Promise(resolve => {
    log('💬正在获取 Chatbot 表')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 Chatbot 表 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已获取 Chatbot 表')
      resolve(result)
    }).core('getChatbotSheetStr', config.init.myName)
  }))


    // 获取 Chatbot 表链接
  requestList.push(new Promise(resolve => {
    log('💬正在获取 Chatbot2 表')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌获取 Chatbot2 表 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已获取 Chatbot 表')
      resolve(result)
    }).core('getChatbotSheetStr2', config.init.myName)
  }))

  
  const origSheetName = ['🚩陌生信息', '🚩每日见证线索', '🚩一场线索', '🚩教会线索']
  for (const sheetName of origSheetName) {
    requestList.push(new Promise(resolve => {
      log(`💬正在获取 ${sheetName}`)
      google.script.run.withFailureHandler(error => {
        console.error(error.message)
        log(`❌获取 ${sheetName} 失败`)
        log(error.message)
      }).withSuccessHandler(result => {
        log(`✅已获取 ${sheetName}`)
        resolve(result)
      }).core('getOrigUserStr', sheetName)
    }))
  }

  await Promise.all(requestList).then(res => {
    const arr = res.map(x => JSON.parse(x))
    config.jianZhengData = arr.filter(x => x.type === '见证线索')[0].result
    config.jianZhengData.church = arr.filter(x => x.type === '交教会线索')[0].result.church
    config.jianZhengData.churchMinify = arr.filter(x => x.type === '交教会线索')[0].result.churchMinify
    config.chatbotSheetList = arr.filter(x => x.type === 'Chatbot表链接').map(x => x.result).flat()
    config.chatbotSheetList2 = arr.filter(x => x.type === 'Chatbot表链接2').map(x => x.result).flat()
    config.origSheetUser = arr.filter(x => x.type === '库存线索').map(x => x.result).flat()
  })

  const requestList2 = []
  const chatbotSheetList2 = config.chatbotSheetList2.map(x => x[0])
  log('✔️ 所有比例数据：', chatbotPercentageResult)


  
  const chatbotSheetListArr = splitArray(chatbotSheetList2, 10)
  const chatbotPercentageResult = []
  // 获取 Chatbot 表贴文比例
  for (const arr of chatbotSheetListArr) {
    const requestList = []

    for (const sheetUrl of arr) {
      requestList.push(new Promise(resolve => {
        log('💬正在写入 Chatbot 贴文比例')
        google.script.run.withFailureHandler(error => {
          console.error(error.message)
          log('❌写入 Chatbot 贴文比例')
          log(error.message)
        }).withSuccessHandler(result => {
          log('✅已获取 Chatbot 贴文比例')
          resolve(result)
        }).core('chatbotPostInfoStr', sheetUrl)
      }))
    }

    await Promise.all(requestList).then(res => {
      const arr = res.map(x => JSON.parse(x))
      try {
        chatbotPercentageResult.push(arr.filter(x => x.type === 'Chatbot贴文比例').map(x => x.result).flat())
      } catch (error) {
        console.error(error.message)
        log('❌ 出现错误')
        log(error.message)
      }
    })
  }
  config.chatbotPercentage = chatbotPercentageResult.flat()



  // 写入见证数据库
  requestList2.push(new Promise(resolve => {
    log('💬正在写入 见证数据库')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌写入 见证数据库 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已写入 见证数据库')
      resolve(result)
    }).core('writeJianZhengDatabase', config.jianZhengData.full)
  }))
  // 写入教会库
  requestList2.push(new Promise(resolve => {
    log('💬正在写入 教会库')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌写入 教会库 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已写入 教会库')
      resolve(result)
    }).core('writeChurchDatabase', config.jianZhengData.church)
  }))
  const newUserList = [
    config.modiSheetUser.map(x => x[3]),
    config.jianZhengData.jianZhengMinify.map(x => x[3]),
    config.jianZhengData.churchMinify.map(x => x[3])
  ].flat()








  // splitArray2D
  const chatbotSheetArr = splitArray2D(config.chatbotSheetList, 10)
  const chatbotQueryUserResult = []
  for (const arr of chatbotSheetArr) {
    const requestList = []
    for (const info of arr) {
      const [pageId, pageIdentifier, chatbotSheetUrl] = info
      requestList.push(new Promise(resolve => {
        log('💬正在查询贴文信息')
        google.script.run.withFailureHandler(error => {
          console.error(error.message)
          log('❌查询贴文信息 失败')
          log(error.message)
        }).withSuccessHandler(result => {
          log('✅已查询 贴文信息')
          resolve(result)
        }).core('chatbotQueryStr', { nameList: newUserList, pageId, identifier: pageIdentifier, sheetUrl: chatbotSheetUrl })
      }))
    }

    await Promise.all(requestList).then(res => {
      const arr = res.map(x => JSON.parse(x))
      try {
        chatbotQueryUserResult.push(arr.filter(x => x.type === 'Chatbot线索').map(x => x.result).flat())
      } catch (error) {
        console.error(error.message)
        log('❌ 出现错误')
        log(error.message)
      }
    })

  }

  config.chatbotQueryUser = chatbotQueryUserResult.flat()


  const requestList3 = []
  // 匹配陌生线索贴文
  config.modiUserPost = []
  for (const info of config.modiSheetUser) {
    const [note, userId, date, username, gender] = info
    const targetDate = formatDateStr(date)
    const postInfo = config.chatbotQueryUser.filter(x => x[3] === username && formatDateStr(x[6]) <= formatDateStr(date))

    let closestEntry = []
    let minDiff = Infinity
    // 查找日期最近的
    postInfo.forEach(entry => {
      const entryDate = new Date(entry[6])
      // console.log(entryDate)
      const diff = Math.abs(entryDate - new Date(targetDate))
      if (diff < minDiff) {
        minDiff = diff
        closestEntry = entry
      }
    })
    if (closestEntry && closestEntry.length > 0) {
      const [pageId, identifier, sheetUrl, username, tag, postUrl, subscribeDate, userGender, postId] = closestEntry
      config.modiUserPost.push([note, userId, date, username, gender, subscribeDate, postId, postUrl, pageId, identifier, sheetUrl])
    } else {
      config.modiUserPost.push([note, userId, date, username, gender, '查询不到', '', '', '', '', ''])
    }
  }

  requestList3.push(new Promise(resolve => {
    log('💬正在写入 🔍️贴文查询（陌生消息）')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌写入 🔍️贴文查询（陌生消息） 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已写入 🔍️贴文查询（陌生消息）')
      resolve(result)
    }).core('writeModiPost', config.modiUserPost)
  }))

  // 匹配见证线索贴文
  config.jianZhengUserPost = []
  for (const info of config.jianZhengData.jianZhengMinify) {
    const [note, userId, date, username, gender] = info
    const targetDate = formatDateStr(date)
    const postInfo = config.chatbotQueryUser.filter(x => x[3] === username && formatDateStr(x[6]) <= formatDateStr(date))

    let closestEntry = []
    let minDiff = Infinity
    // 查找日期最近的
    postInfo.forEach(entry => {
      const entryDate = new Date(entry[6])
      console.log(entryDate)
      const diff = Math.abs(entryDate - new Date(targetDate))
      if (diff < minDiff) {
        minDiff = diff
        closestEntry = entry
      }
    })

    if (closestEntry && closestEntry.length > 0) {
      const [pageId, identifier, sheetUrl, username, tag, postUrl, subscribeDate, userGender, postId] = closestEntry
      config.jianZhengUserPost.push([note, userId, date, username, gender, subscribeDate, postId, postUrl, pageId, identifier, sheetUrl])
    } else {
      config.jianZhengUserPost.push([note, userId, date, username, gender, '查询不到', '', '', '', '', ''])
    }
  }

  requestList3.push(new Promise(resolve => {
    log('💬正在写入 🔍️贴文查询（见证）')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌写入 🔍️贴文查询（见证） 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已写入 🔍️贴文查询（见证）')
      resolve(result)
    }).core('writeJianZhengPost', config.jianZhengUserPost)
  }))

  // 匹配教会线索贴文
  config.churchUserPost = []
  for (const info of config.jianZhengData.churchMinify) {
    const [note, userId, date, username, gender] = info
    const targetDate = formatDateStr(date)
    const postInfo = config.chatbotQueryUser.filter(x => x[3] === username && formatDateStr(x[6]) <= formatDateStr(date))

    let closestEntry = []
    let minDiff = Infinity
    // 查找日期最近的
    postInfo.forEach(entry => {
      const entryDate = new Date(entry[6])
      console.log(entryDate)
      const diff = Math.abs(entryDate - new Date(targetDate))
      if (diff < minDiff) {
        minDiff = diff
        closestEntry = entry
      }
    })

    if (closestEntry && closestEntry.length > 0) {
      const [pageId, identifier, sheetUrl, username, tag, postUrl, subscribeDate, userGender, postId] = closestEntry
      config.churchUserPost.push([note, userId, date, username, gender, subscribeDate, postId, postUrl, pageId, identifier, sheetUrl])
    } else {
      config.churchUserPost.push([note, userId, date, username, gender, '查询不到', '', '', '', '', ''])
    }
  }

  requestList3.push(new Promise(resolve => {
    log('💬正在写入 🔍️贴文查询（教会）')
    google.script.run.withFailureHandler(error => {
      console.error(error.message)
      log('❌写入 🔍️贴文查询（教会） 失败')
      log(error.message)
    }).withSuccessHandler(result => {
      log('✅已写入 🔍️贴文查询（教会）')
      resolve(result)
    }).core('writeChurchPost', config.churchUserPost)
  }))

  const origSheet = config.origSheetUser
  const userPosts = [config.modiUserPost, config.jianZhengUserPost, config.jianZhengUserPost, config.churchUserPost]
  for (let i = 0; i < origSheet.length; i++) {
    const { sheetName, result } = origSheet[i]
    // const namesObj = new Set(result.map(item => item[0]))
    // let filteredArray = userPosts[i].filter(item => !namesObj.has(item[3]))

const namesObj = new Set(result.map(item => `${item[0]}|${item[1]}`)) 

let filteredArray = userPosts[i].filter(item => {
  const key = `${item[2]}|${item[3]}`
  return !namesObj.has(key)
})
    if (sheetName === '🚩一场线索') {
      filteredArray = filteredArray.filter(item1 =>
        config.jianZhengData.full.some(item2 => item2[8] === item1[3] && item2[16].includes('D'))
      )
    }

    // 从见证贴文信息筛选出1场
    requestList3.push(new Promise(resolve => {
      log(`💬正在写入 ${sheetName}`)
      google.script.run.withFailureHandler(error => {
        console.error(error.message)
        log(`❌写入 ${sheetName} 失败`)
        log(error.message)
      }).withSuccessHandler(result => {
        log(`✅已写入 ${sheetName}`)
        resolve(result)
      }).core('writeNewUser', { sheetName, result: filteredArray })
    }))
  }

  await Promise.all(requestList3)

  log('💬正在匹配 贴文信息')
  google.script.run.withFailureHandler(error => {
    console.error(error.message)
    log('❌匹配 贴文信息 失败')
    log(error.message)
  }).withSuccessHandler(result => {
    log('✅已写入 贴文信息')
    log('✅全部运行完成')
  }).core('getPostInfoStr', config.chatbotPercentage)
})
