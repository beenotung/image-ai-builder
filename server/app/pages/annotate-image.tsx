import { o } from '../jsx/jsx.js'
import { ajaxRoute, Routes } from '../routes.js'
import { apiEndpointTitle, title } from '../../config.js'
import Style from '../components/style.js'
import { seedRow } from 'better-sqlite3-proxy'
import {
  Context,
  DynamicContext,
  ExpressContext,
  getContextFormBody,
  throwIfInAPI,
  WsContext,
} from '../context.js'
import { mapArray } from '../components/fragment.js'
import { IonBackButton } from '../components/ion-back-button.js'
import { id, number, object, string, values } from 'cast.ts'
import { Link, Redirect } from '../components/router.js'
import { renderError, showError } from '../components/error.js'
import { getAuthUser, getAuthUserId } from '../auth/user.js'
import { evalLocale, Locale, makeThrows, Title } from '../components/locale.js'
import { proxy } from '../../../db/proxy.js'
import { toRouteUrl } from '../../url.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { loadClientPlugin } from '../../client-plugin.js'
import { EarlyTerminate, MessageException } from '../../exception.js'
import { IonButton } from '../components/ion-button.js'

let sweetAlertPlugin = loadClientPlugin({
  entryFile: 'dist/client/sweetalert.js',
})
let imagePlugin = loadClientPlugin({
  entryFile: 'dist/client/image.js',
})

let pageTitle = <Locale en="Annotate Image" zh_hk="標註圖片" zh_cn="注释图像" />

let style = Style(/* css */ `
#AnnotateImage .control-buttons ion-button {
  flex-grow: 1;
  margin: 0;
  height: 4rem;
}
`)

let script = Script(/* js */ `

// show corresponding image
showImage();

// show image request
function showImage(){
  emit('/annotate-image/showImage', {
    label_id: label_select.value,
  })
}

function submitAnnotation(answer) {
  let image = label_image
  let image_id = image.dataset.imageId
  let rotation = image.dataset.rotation || 0
  emit('/annotate-image/submit', {
    label: label_select.value,
    image: image_id,
    answer,
    rotation,
  })
}

// Show image (Not finished / can't use onchange="")
label_select.addEventListener('ionChange', showImage)

// Send undo annotation request
function undoAnnotation() {
  let label_id = label_select.value
  emit('/annotate-image/undo', {
    label_id
  })
}

function rotateAnnotationImage(image) {
  let degree = image.dataset.rotation || 0
  degree = (degree + 90) % 360
  image.dataset.rotation = degree
  rotateImageInline(image)
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
    <ion-content id="AnnotateImage" class="ion-no-padding">
      <Main />
    </ion-content>
    {imagePlugin.node}
    {sweetAlertPlugin.node}
    {script}
  </>
)

let count_annotated_images = db
  .prepare<{ label_id: number }, number>(
    /* sql */ `
select count(distinct image_id)
from image_label
where label_id = :label_id
`,
  )
  .pluck()

function Main(attrs: {}, context: DynamicContext) {
  let user = getAuthUser(context)
  if (!user) {
    return (
      <>
        <div style="margin: auto; width: fit-content; text-align: center;">
          <p class="ion-padding ion-margin error">
            <Locale
              en="You must be logged in to annotate images"
              zh_hk="您必須登入才能標註圖片"
              zh_cn="您必须登录才能标注图像"
            />
          </p>
          <IonButton url="/login" color="primary">
            <Locale en="Login" zh_hk="登入" zh_cn="登录" />
          </IonButton>
        </div>
      </>
    )
  }
  let params = new URLSearchParams(context.routerMatch?.search)
  let label_id = +params.get('label')! || 1
  let image = select_next_image.get({ label_id })
  let total_images = proxy.image.length
  let last_annotation = select_previous_image_label.get({
    user_id: user.id!,
    label_id,
  })
  return (
    <>
      <div style="height: 100%; display: flex; flex-direction: column; text-align: center">
        <ion-item>
          {/* TODO load image of selected label */}
          <ion-select
            value={label_id}
            label={Locale(
              { en: 'Class Label', zh_hk: '類別標籤', zh_cn: '类別标签' },
              context,
            )}
            id="label_select"
          >
            {mapArray(proxy.label, label => {
              let annotated_images = count_annotated_images.get({
                label_id: label.id!,
              })
              return (
                <ion-select-option value={label.id}>
                  {label.title} ({annotated_images}/{total_images})
                </ion-select-option>
              )
            })}
          </ion-select>
        </ion-item>
        <div style="flex-grow: 1; overflow: hidden">
          <img
            data-image-id={image?.id}
            data-rotation={image?.rotation || 0}
            id="label_image"
            src={`/uploads/${image?.filename}`}
            alt={
              <Locale
                en="Loading image..."
                zh_hk="載入圖片中..."
                zh_cn="加载图像中..."
              />
            }
            style="height: 100%; object-fit: contain"
            onclick="rotateAnnotationImage(this)"
            onload="rotateImageInline(this); this.onload = null"
            hidden={!image}
          />
          <div
            style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 2rem;"
            hidden={!!image}
          >
            <div>
              <ion-icon
                name="checkmark-circle"
                style="font-size: 4rem; color: var(--ion-color-success);"
              ></ion-icon>
              <h2>
                <Locale
                  en="All images annotated!"
                  zh_hk="所有圖片已標註完成！"
                  zh_cn="所有图像已注释完成！"
                />
              </h2>
              <p>
                <Locale
                  en="You have completed annotating all images for this label."
                  zh_hk="您已完成此標籤的所有圖片標註。"
                  zh_cn="您已完成此标签的所有图像注释。"
                />
              </p>
              <p>
                <Locale
                  en="Please select another label to continue."
                  zh_hk="請選擇另一個標籤繼續。"
                  zh_cn="请选择另一个标签继续。"
                />
              </p>
            </div>
          </div>
        </div>
        <div style="display: flex;" class="control-buttons">
          <ion-button
            size="large"
            color="danger"
            onclick="submitAnnotation(0)"
            id="btn_submit_reject"
            disabled={!image}
            title={
              <Locale
                en="Annotate as not having the label"
                zh_hk="標註為沒有標籤"
                zh_cn="标注为没有标签"
              />
            }
          >
            <ion-icon name="close" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button
            size="large"
            color="dark"
            onclick="undoAnnotation()"
            id="btn_undo"
            disabled={!last_annotation}
            title={<Locale en="Undo" zh_hk="還原" zh_cn="还原" />}
          >
            <ion-icon name="arrow-undo" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button
            size="large"
            color="success"
            onclick="submitAnnotation(1)"
            id="btn_submit_agree"
            disabled={!image}
            title={
              <Locale
                en="Annotate as having the label"
                zh_hk="標註為有標籤"
                zh_cn="标注为有标签"
              />
            }
          >
            <ion-icon name="checkmark" slot="icon-only"></ion-icon>
          </ion-button>
        </div>
      </div>
    </>
  )
}

let select_next_image = db.prepare<
  { label_id: number },
  { id: number; filename: string; rotation: number | null }
>(/* sql */ `
select image.id, image.filename, image.rotation
from image
where id not in (
  select image_id from image_label
  where label_id = :label_id
)
`)

async function getNextImage(context: ExpressContext) {
  let { req } = context
  try {
    let user = getAuthUser(context)
    if (!user) throw 'You must be logged in to annotate image'
    let label_id = +req.query.label!
    if (!label_id) throw 'missing label'
    let image = select_next_image.get({ label_id })
    return { image }
  } catch (error) {
    return { error: String(error) }
  }
}

// select last image_label in current user (for undo)
let select_previous_image_label = db.prepare<
  { user_id: number; label_id: number },
  { id: number; image_id: number }
>(/* sql */ `
select
  id
, image_id
from image_label
where user_id = :user_id
  and label_id = :label_id
order by created_at desc
limit 1
`)

// select next image > annotate
let showImageParser = object({
  label_id: id(),
})

function ShowImage(attrs: {}, context: WsContext) {
  try {
    let throws = makeThrows(context)

    let user_id = getAuthUserId(context)!
    if (!user_id)
      throws({
        en: 'You must be logged in to show image',
        zh_hk: '您必須登入才能顯示圖片',
        zh_cn: '您必须登录才能显示图片',
      })

    let body = getContextFormBody(context)
    let input = showImageParser.parse(body)
    let label_id = input.label_id

    // clear current image
    context.ws.send([
      'update-attrs',
      '#label_image',
      {
        'src': '',
        'data-image-id': '',
        'data-rotation': 0,
      },
    ])

    // check if label exists
    let next_image = select_next_image.get({ label_id })

    // if no image found, return error
    if (!next_image) {
      // if no image found, disable submit AGREE & REJECT button
      context.ws.send(['update-attrs', '#btn_submit_agree', { disabled: true }])
      context.ws.send([
        'update-attrs',
        '#btn_submit_reject',
        { disabled: true },
      ])
    } else {
      // if image found, enable submit AGREE & REJECT button
      context.ws.send([
        'update-attrs',
        '#btn_submit_agree',
        { disabled: false },
      ])
      context.ws.send([
        'update-attrs',
        '#btn_submit_reject',
        { disabled: false },
      ])
    }

    // if found previous image on current label & user > enable undo button
    let last_annotation = select_previous_image_label.get({
      user_id,
      label_id,
    })!

    // enable undo button
    if (last_annotation) {
      context.ws.send(['update-attrs', '#btn_undo', { disabled: false }])
    } else {
      context.ws.send(['update-attrs', '#btn_undo', { disabled: true }])
    }

    // load image from database
    context.ws.send([
      'update-attrs',
      '#label_image',
      {
        'src': next_image ? `/uploads/${next_image.filename}` : '',
        'data-image-id': next_image ? next_image.id : '',
        'data-rotation': 0,
      },
    ])
    throw EarlyTerminate
  } catch (error) {
    if (error !== EarlyTerminate) {
      console.error(error)
      context.ws.send(showError(error))
    }
    throw EarlyTerminate
  }
}

let undoAnnotationParser = object({
  label_id: id(),
})

// delete latest annotation in current user, and return to display
function UndoAnnotation(attrs: {}, context: WsContext) {
  try {
    let throws = makeThrows(context)

    let user_id = getAuthUserId(context)!
    if (!user_id)
      throws({
        en: 'You must be logged in to undo annotation',
        zh_hk: '您必須登入才能還原標註',
        zh_cn: '您必须登录才能还原标注',
      })

    let body = getContextFormBody(context)
    let input = undoAnnotationParser.parse(body)
    let label_id = input.label_id

    let last_annotation = select_previous_image_label.get({
      user_id,
      label_id,
    })!

    if (!last_annotation) {
      // if no previous image > disable undo button
      context.ws.send(['update-attrs', '#btn_undo', { disabled: true }])
      throws({
        en: 'No previous annotation to undo',
        zh_hk: '沒有之前的標註可以還原',
        zh_cn: '没有之前的标注可以还原',
      })
    }

    let image = proxy.image[last_annotation.image_id]

    delete proxy.image_label[last_annotation.id]

    // TODO update the counts
    context.ws.send([
      'batch',
      [
        [
          'update-attrs',
          '#label_image',
          {
            'src': `/uploads/${image.filename}`,
            'data-image-id': image.id,
            'data-rotation': image.rotation || 0,
          },
        ],
        [
          'eval',
          `label_image.onload = () => { rotateImageInline(label_image); label_image.onload = null }`,
        ],
      ],
    ])

    // disable / enable undo button
    last_annotation = select_previous_image_label.get({
      user_id,
      label_id,
    })!

    // if no previous image found, disable undo button
    if (!last_annotation) {
      context.ws.send(['update-attrs', '#btn_undo', { disabled: true }])
    }

    // if undo successfully, allow submit AGREE & REJECT button
    context.ws.send(['update-attrs', '#btn_submit_agree', { disabled: false }])
    context.ws.send(['update-attrs', '#btn_submit_reject', { disabled: false }])

    throw EarlyTerminate
  } catch (error) {
    if (error !== EarlyTerminate) {
      console.error(error)
      context.ws.send(showError(error))
    }
    throw EarlyTerminate
  }
}

let submitAnnotationParser = object({
  args: object({
    0: object({
      label: id(),
      image: id(),
      answer: values([0, 1]),
      rotation: number(),
    }),
  }),
})

function SubmitAnnotation(attrs: {}, context: WsContext) {
  try {
    let user = getAuthUser(context)
    if (!user) throw 'You must be logged in to annotate image'

    let {
      args: { 0: input },
    } = submitAnnotationParser.parse(context)

    let label = proxy.label[input.label]
    let image = proxy.image[input.image]

    if (!label) throw 'label not found'
    if (!image) throw 'image not found'

    if (image.rotation !== input.rotation) {
      image.rotation = input.rotation
    }

    seedRow(
      proxy.image_label,
      {
        label_id: label.id!,
        image_id: image.id!,
        user_id: user.id!,
      },
      {
        answer: +input.answer,
      },
    )

    let next_image = select_next_image.get({ label_id: input.label })
    if (next_image) {
      // if found next image, update image src
      context.ws.send([
        'update-attrs',
        '#label_image',
        {
          'src': next_image ? `/uploads/${next_image.filename}` : '',
          'data-image-id': next_image ? next_image.id : '',
          'data-rotation': 0,
        },
      ])
    } else {
      // if no image found, clear current image
      context.ws.send([
        'update-attrs',
        '#label_image',
        {
          'src': '',
          'data-image-id': '',
          'data-rotation': 0,
        },
      ])
      // disable AGREE
      context.ws.send(['update-attrs', '#btn_submit_agree', { disabled: true }])
      // disable REJECT
      context.ws.send([
        'update-attrs',
        '#btn_submit_reject',
        { disabled: true },
      ])
    }

    // if submit successfully, allow undo button
    context.ws.send(['update-attrs', '#btn_undo', { disabled: false }])

    throw EarlyTerminate
  } catch (error) {
    if (error === EarlyTerminate) {
      throw error
    }
    console.error(error)
    context.ws.send(showError(error))
    throw EarlyTerminate
  }
}

let routes = {
  '/annotate-image': {
    title: <Title t={pageTitle} />,
    description: 'TODO',
    node: page,
  },
  '/annotate-image/image': ajaxRoute({
    description: 'get next image to be annotated',
    api: getNextImage,
  }),
  '/annotate-image/submit': {
    title: apiEndpointTitle,
    description: 'submit image annotation',
    node: <SubmitAnnotation />,
  },
  '/annotate-image/undo': {
    title: apiEndpointTitle,
    description: 'undo image annotation',
    node: <UndoAnnotation />,
  },
  '/annotate-image/showImage': {
    title: apiEndpointTitle,
    description: 'show image for selected label',
    node: <ShowImage />,
  },
} satisfies Routes

export default { routes }
