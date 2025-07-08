import { o } from '../jsx/jsx.js'
import { ajaxRoute, Routes } from '../routes.js'
import { apiEndpointTitle } from '../../config.js'
import Style from '../components/style.js'
import { seedRow } from 'better-sqlite3-proxy'
import {
  DynamicContext,
  ExpressContext,
  getContextFormBody,
  WsContext,
} from '../context.js'
import { mapArray } from '../components/fragment.js'
import { IonBackButton } from '../components/ion-back-button.js'
import { id, number, object, values } from 'cast.ts'
import { showError } from '../components/error.js'
import { getAuthUser, getAuthUserId } from '../auth/user.js'
import { Locale, makeThrows, Title } from '../components/locale.js'
import { proxy } from '../../../db/proxy.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { loadClientPlugin } from '../../client-plugin.js'
import { EarlyTerminate } from '../../exception.js'
import { last } from '@beenotung/tslib'

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
function submitAnnotation(answer) {
  let image = label_image
  let image_id = image.dataset.imageId
  let rotation = image.dataset.degree || 0
  emit('/annotate-image/submit', {
    label: label_select.value,
    image: image_id,
    answer,
    rotation,
  })
}

// Show image (Not finished / can't use onchange="")
label_select.addEventListener('ionChange', function(event) {
  console.log('label_select changed ', label_select.value)
  emit('/annotate-image/showImage', {
    label_id: label_select.value,
  })
})

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

let count_image = db
  .prepare<{ label_id: number }, number>(
    /* sql */ `
select count(*) from image
where id not in (
  select image_id from image_label
  where label_id = :label_id
)
`,
  )
  .pluck()

function Main(attrs: {}, context: DynamicContext) {
  let user = getAuthUser(context)
  let params = new URLSearchParams(context.routerMatch?.search)
  let label_id = +params.get('label')! || 1
  let image = select_next_image.get({ label_id })
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
            {mapArray(proxy.label, label => (
              <ion-select-option value={label.id}>
                {label.title} ({count_image.get({ label_id: label.id! })})
              </ion-select-option>
            ))}
          </ion-select>
        </ion-item>
        <div style="flex-grow: 1; overflow: hidden">
          <img
            data-image-id={image?.id}
            id="label_image"
            src={image ? `/uploads/${image.filename}` : ''}
            alt="no images to be annotated, please select another label"
            style="height: 100%; object-fit: contain"
            onclick="rotateAnnotationImage(this)"
          />
        </div>
        <div style="display: flex;" class="control-buttons">
          <ion-button
            size="large"
            color="danger"
            onclick="submitAnnotation(0)"
            id="btn_submit_reject"
          >
            <ion-icon name="close" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button
            size="large"
            color="dark"
            onclick="undoAnnotation()"
            id="btn_undo"
            disabled="false"
          >
            <ion-icon name="arrow-undo" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button
            size="large"
            color="success"
            onclick="submitAnnotation(1)"
            id="btn_submit_agree"
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
  { id: number; filename: string }
>(/* sql */ `
select image.id, image.filename
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

    // always enable undo button (change label show image)
    context.ws.send(['update-attrs', '#btn_undo', { disabled: false }])

    // if no image found, return error
    if (!next_image) {
      // if no image found, disable submit AGREE & REJECT button
      context.ws.send(['update-attrs', '#btn_submit_agree', { disabled: true }])
      context.ws.send([
        'update-attrs',
        '#btn_submit_reject',
        { disabled: true },
      ])

      throws({
        en: 'No images to be annotated, please select another label, or undo annotation',
        zh_hk: '沒有圖片可以標註，請選擇另一個標籤, 或還原標註',
        zh_cn: '没有图片可以注释，请选择另一个标签, 或还原标注',
      })
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
      'update-attrs',
      '#label_image',
      {
        'src': `/uploads/${image.filename}`,
        'data-image-id': image.id,
        'data-rotation': image.rotation || 0,
      },
    ])
    // TODO disable / enable undo button (finished/wait confirmation)

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
