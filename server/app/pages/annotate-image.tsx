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
import { getAuthUser } from '../auth/user.js'
import { evalLocale, Locale, Title } from '../components/locale.js'
import { proxy } from '../../../db/proxy.js'
import { toRouteUrl } from '../../url.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { loadClientPlugin } from '../../client-plugin.js'
import { EarlyTerminate, MessageException } from '../../exception.js'

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
function redoAnnotation() {
  let label_select = document.getElementById('label_select')
  let label_id = label_select.value
  let image_to_annotate = document.getElementById('label_image')
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
          <ion-button size="large" color="danger" onclick="submitAnnotation(0)">
            <ion-icon name="close" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button size="large" color="dark" onclick="undoAnnotation()">
            <ion-icon name="arrow-undo" slot="icon-only"></ion-icon>
          </ion-button>
          <ion-button
            size="large"
            color="success"
            onclick="submitAnnotation(1)"
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
} satisfies Routes

export default { routes }
