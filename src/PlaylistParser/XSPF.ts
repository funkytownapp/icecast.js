import {logger} from '../logger';
import * as Utils from '../utils';
import {APlaylistParser, IPlaylistStream} from './PlaylistParser';

/**
 * XSPF files parser.
 */
export class XSPF extends APlaylistParser {
  /**
   * Logger.
   */
  private logger: Log = logger('XSPF Parser');

  /**
   * Constructor.
   *
   * @param data Playlist file data.
   */
  constructor(data: string) {
    super(data);
  }

  /**
   * Tries to parse stream.
   *
   * @return A promise resolved when parsing is done.
   */
  public async parse(): Promise<IPlaylistStream[]> {
    return new Promise<IPlaylistStream[]>((resolve: Function, reject: Function): void => {
      const parser: DOMParser = new DOMParser();
      const doc: Document = parser.parseFromString(this.content, 'application/xml');

      if (doc.getElementsByTagName('parsererror').length) {
        return reject(new Error('XML error'));
      }
      this.streams = this.parsePlaylist(doc);
      if (!this.streams.length) {
        return reject(new Error('No streams found'));
      }
      return resolve(this.streams);
    });
  }

  /**
   * Extract streams from the <playlist> tags.
   *
   * @param doc Parsed playlist document.
   */
  private parsePlaylist(doc: Document): IPlaylistStream[] {
    const playlists: NodeList = doc.getElementsByTagName('playlist');
    let streams: IPlaylistStream[] = [];

    [].slice.call(playlists).forEach((playlist: Element): void => {
      let trackList: Element | null = null;
      let defaultTitle: string = '';

      for (const child of Array.from(playlist.childNodes)) {
        if (Utils.isUndefined((<Element>child).tagName)) {
          continue;
        }

        const elem: Element = (<Element>child);

        if (
          (elem.tagName === 'title') &&
          (elem.textContent !== null)
        ) {
          defaultTitle = (elem.textContent === null) ? '' : elem.textContent;
        }
        if (elem.tagName === 'trackList') {
          trackList = elem;
        }
      }
      if (trackList !== null) {
        streams = streams.concat(this.parseTrackList(trackList, defaultTitle));
      }
    });
    this.logger.debug(streams);

    return streams;
  }
  /**
   * Extract streams from the <trackList> tags.
   *
   * @param trackList    <trackList> to parse.
   * @param defaultTitle Default stream title.
   */
  private parseTrackList(trackList: Element, defaultTitle: string): IPlaylistStream[] {
    const streams: IPlaylistStream[] = [];

    [].slice.call(trackList.getElementsByTagName('track')).forEach((track: Element): void => {
      const stream: IPlaylistStream = APlaylistParser.createDefaultStream();
      let url: string = '';
      let title: string = defaultTitle;
      /* tslint:disable: no-any */
      let metas: any = {};
      /* tslint:enable: no-any */
      let description: string = '';
      let duration: number = -1;

      [].slice.call(track.childNodes).forEach((child: Element): void => {
        if (child.tagName === 'title' && (child.textContent !== null)) {
          title = child.textContent;
        }
        if (child.tagName === 'location' && (child.textContent !== null)) {
          const value: string = child.textContent.trim().toLocaleLowerCase();

          if (!value.match(/^https?:\/\//i)) {
            this.logger.warn(`Ignoring non http-stream : ${value}`);
            return;
          }
          url = value;
        }
        if (child.tagName === 'annotation' && (child.textContent !== null)) {
          metas = this.extractMetasFromAnnotation(child.textContent.trim());
        }
        if (child.tagName === 'info' && (child.textContent !== null)) {
          description = child.textContent;
        }
        if (child.tagName === 'duration' && (child.textContent !== null)) {
          const value: number = parseInt(child.textContent, 10);

          duration = isNaN(value) ? -1 : (value / 1000);
        }
      });
      if (url.length === 0) {
        this.logger.debug('Skipping streamless track : ', track);
        return;
      }
      stream.title = title;
      stream.description = description;
      stream.duration = duration;
      stream.streamUrl = url;
      stream.metas = metas;
      if (metas.bitrate && (typeof metas.bitrate === 'number')) {
        stream.bitrate = metas.bitrate;
      }
      if (metas.contentType) {
        stream.mimeType = metas.contentType;
      }
      if ((stream.description.length > 0) && (metas.streamDescription.length > 0)) {
        stream.description = metas.streamDescription;
      }
      streams.push(stream);
    });
    return streams;
  }
  /**
   * Extract metas from Icecast formatted annotation tag.
   *
   * @param content Tag content.
   */
  /* tslint:disable: no-any */
  private extractMetasFromAnnotation(content: string): any {
    const metas: any = {};
    /* tslint:enable: no-any */

    content.split(/[\r\n]+/).forEach((line: string): void => {
      if (line.indexOf(':') !== -1) {
        const parts: string[] = line.split(':');

        metas[Utils.camelize(parts[0].trim())] = parts.slice(1).join(':').trim();
      }
    });
    return metas;
  }
}
