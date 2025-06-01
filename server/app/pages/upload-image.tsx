import { o } from '../jsx/jsx.js'
import { ajaxRoute, Routes } from '../routes.js'
import { apiEndpointTitle, title } from '../../config.js'
import Style from '../components/style.js'
import {
  Context,
  DynamicContext,
  ExpressContext,
  getContextFormBody,
  throwIfInAPI,
} from '../context.js'
import { mapArray } from '../components/fragment.js'
import { IonBackButton } from '../components/ion-back-button.js'
import { object, string } from 'cast.ts'
import { Link, Redirect } from '../components/router.js'
import { renderError } from '../components/error.js'
import { getAuthUser, getAuthUserId } from '../auth/user.js'
import { evalLocale, Locale } from '../components/locale.js'
import { proxy, User } from '../../../db/proxy.js'
import { loadClientPlugin } from '../../client-plugin.js'
import { Script } from '../components/script.js'
import { createUploadForm } from '../upload.js'
import { del } from 'better-sqlite3-proxy'
import { rm } from 'fs/promises'
import { join } from 'path'
import { env } from '../../env.js'

let pageTitle = (
  <Locale en="Upload Image" zh_hk="上傳圖片" zh_cn="上传图片" />
)
let addPageTitle = (
  <Locale
    en="Add Upload Image"
    zh_hk="添加Upload Image"
    zh_cn="添加Upload Image"
  />
)

let style = Style(/* css */ `
#UploadImage #imageList {
  display: flex;
  flex-direction: column-reverse;
  flex-wrap: wrap;
  gap: 1rem;
}
#UploadImage #imageList .image-item {
  text-align: center;
  position: relative;
  background-color: white;
  padding: 0.5rem;
  border-radius: 0.5rem;
}
#UploadImage #imageList .image-item--buttons {
  position: absolute;
  top: 0;
  right: 0
}
#UploadImage #imageList .image-item--filename {
}
`)

let imagePlugin = loadClientPlugin({
  entryFile: 'dist/client/image.js',
})
let sweetAlertPlugin = loadClientPlugin({
  entryFile: 'dist/client/sweetalert.js',
})

let script = Script(/* js */ `
var imageItemTemplate = document.querySelector('#imageList .image-item')
imageItemTemplate.remove()

async function pickImage() {
  let files = await selectImage({
    accept: '.jpg,.png,.webp,.heic,.gif',
    multiple: true,
  })
  let formData = new FormData()
  for (let _file of files) {
    let { dataUrl, file } = await compressImageFile(_file)
    let imageItem = imageItemTemplate.cloneNode(true)
    let image = imageItem.querySelector('img')
    image.src = dataUrl
    image.file = file
    imageItem.querySelector('.image-item--filename').textContent = file.name
    imageList.appendChild(imageItem)
    let uploadButton = imageItem.querySelector('.image-item--upload')
  }
  let buttons = imageList.querySelectorAll('.image-item--upload[color="primary"]')
  for (let button of buttons) {
    let imageItem = button.closest('.image-item')
    let image = imageItem.querySelector('img')
    let file = image.file
    let formData = new FormData()
    formData.append('image', file)
    let res = await fetch('/upload-image/submit', {
      method: 'POST',
      body: formData,
    })
    let json = await res.json()
    if (json.error) {
      showError(json.error)
      return
    }
    let url = json.url
    image.src = url
    button.setAttribute('color', 'success')
    imageCount.textContent = json.count.toLocaleString()
  }
}

async function removeImage(button) {
  let imageItem = button.closest('.image-item')
  let image = imageItem.querySelector('img')
  let url = image.getAttribute('src')
  if (url.startsWith('/uploads/')) {
    let filename = url.slice('/uploads/'.length)
    let params = new URLSearchParams({ filename })
    let json = await fetch_json('/upload-image/remove?' + params)
    if (json.error) {
      return
    }
    imageCount.textContent = json.count.toLocaleString()
  }
  imageItem.remove()
}

`)

let page = (
  <>
    {style}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/" backText="Home" />
        <ion-title role="heading" aria-level="1">
          {pageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="UploadImage" class="ion-padding" color="light">
      <Main />
    </ion-content>
    {imagePlugin.node}
    {sweetAlertPlugin.node}
    {script}
  </>
)

let items = [
  { title: 'Android', slug: 'md' },
  { title: 'iOS', slug: 'ios' },
]

function Main(attrs: {}, context: Context) {
  let user = getAuthUser(context)
  let count = proxy.image.length.toLocaleString()
  return (
    <>
      <div style="margin-bottom: 0.5rem; text-align: center">
        Existing <span id="imageCount">{count}</span> images.
      </div>
      <form style="text-align: center">
        <ion-button onclick={user ? 'pickImage()' : 'goto("/login")'}>
          <ion-icon name="cloud-upload" slot="start"></ion-icon> Upload Photos
        </ion-button>
        <div id="imageList">
          <ImageItem
            image_url="https://picsum.photos/seed/1/200/300"
            filename="filename.jpg"
            user={user}
          />
          {mapArray(proxy.image, image => {
            return (
              <ImageItem
                image_url={`/uploads/${image.filename}`}
                filename={image.original_filename || image.filename}
                user={user}
              />
            )
          })}
        </div>
      </form>
    </>
  )
}

function ImageItem(attrs: {
  image_url: string
  filename: string
  user: User | null
}) {
  return (
    <div class="image-item">
      <div class="image-item--buttons">
        <ion-button color="primary" disabled class="image-item--upload">
          <ion-icon name="cloud-upload-outline" slot="icon-only"></ion-icon>
        </ion-button>
        <ion-button
          color="danger"
          onclick={attrs.user ? 'removeImage(this)' : 'goto("/login")'}
        >
          <ion-icon name="trash" slot="icon-only"></ion-icon>
        </ion-button>
      </div>
      <img src={attrs.image_url} />
      <div class="image-item--filename">{attrs.filename}</div>
    </div>
  )
}

let addPage = (
  <>
    {Style(/* css */ `
#AddUploadImage .hint {
  margin-inline-start: 1rem;
  margin-block: 0.25rem;
}
`)}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/upload-image" backText={pageTitle} />
        <ion-title role="heading" aria-level="1">
          {addPageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="AddUploadImage" class="ion-padding">
      <form
        method="POST"
        action="/upload-image/add/submit"
        onsubmit="emitForm(event)"
      >
        <ion-list>
          <ion-item>
            <ion-input
              name="title"
              label="Title*:"
              label-placement="floating"
              required
              minlength="3"
              maxlength="50"
            />
          </ion-item>
          <p class="hint">(3-50 characters)</p>
          <ion-item>
            <ion-input
              name="slug"
              label="Slug*: (unique url)"
              label-placement="floating"
              required
              pattern="(\w|-|\.){1,32}"
            />
          </ion-item>
          <p class="hint">
            (1-32 characters of: <code>a-z A-Z 0-9 - _ .</code>)
          </p>
        </ion-list>
        <div style="margin-inline-start: 1rem">
          <ion-button type="submit">Submit</ion-button>
        </div>
        <p>
          Remark:
          <br />
          *: mandatory fields
        </p>
        <p id="add-message"></p>
      </form>
    </ion-content>
  </>
)

function AddPage(attrs: {}, context: DynamicContext) {
  let user = getAuthUser(context)
  if (!user) return <Redirect href="/login" />
  return addPage
}

let submitParser = object({
  title: string({ minLength: 3, maxLength: 50 }),
  slug: string({ match: /^[\w-]{1,32}$/ }),
})

function Submit(attrs: {}, context: DynamicContext) {
  try {
    let user = getAuthUser(context)
    if (!user) throw 'You must be logged in to submit ' + pageTitle
    let body = getContextFormBody(context)
    let input = submitParser.parse(body)
    let id = items.push({
      title: input.title,
      slug: input.slug,
    })
    return <Redirect href={`/upload-image/result?id=${id}`} />
  } catch (error) {
    throwIfInAPI(error, '#add-message', context)
    return (
      <Redirect
        href={
          '/upload-image/result?' +
          new URLSearchParams({ error: String(error) })
        }
      />
    )
  }
}

function SubmitResult(attrs: {}, context: DynamicContext) {
  let params = new URLSearchParams(context.routerMatch?.search)
  let error = params.get('error')
  let id = params.get('id')
  return (
    <>
      <ion-header>
        <ion-toolbar>
          <IonBackButton href="/upload-image/add" backText="Form" />
          <ion-title role="heading" aria-level="1">
            Submitted {pageTitle}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content id="AddUploadImage" class="ion-padding">
        {error ? (
          renderError(error, context)
        ) : (
          <>
            <p>Your submission is received (#{id}).</p>
            <Link href="/upload-image" tagName="ion-button">
              Back to {pageTitle}
            </Link>
          </>
        )}
      </ion-content>
    </>
  )
}

async function UploadImage(context: ExpressContext) {
  let { req, res } = context
  try {
    let user_id = getAuthUserId(context)
    if (!user_id) throw 'not login'
    let form = createUploadForm()
    let [fields, files] = await form.parse(req)
    for (let file of files.image || []) {
      proxy.image.push({
        original_filename: file.originalFilename || null,
        filename: file.newFilename,
        user_id,
      })
      let url = '/uploads/' + file.newFilename
      res.json({ url, count: proxy.image.length })
      return
    }
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
}

async function RemoveImage(context: ExpressContext) {
  let { req, res } = context
  try {
    let { filename } = req.query
    if (typeof filename !== 'string') throw 'filename is required'
    del(proxy.image, { filename })
    let file = join(env.UPLOAD_DIR, filename)
    await rm(file, { force: true })
    res.json({ count: proxy.image.length })
  } catch (error) {
    res.json({ error: String(error) })
  }
}

let routes = {
  '/upload-image': {
    resolve(context) {
      let t = evalLocale(pageTitle, context)
      return {
        title: title(t),
        description: 'TODO',
        node: page,
      }
    },
  },
  '/upload-image/submit': ajaxRoute({
    description: 'upload image',
    api: UploadImage,
  }),
  '/upload-image/remove': ajaxRoute({
    description: 'remove image',
    api: RemoveImage,
  }),
} satisfies Routes

export default { routes }
